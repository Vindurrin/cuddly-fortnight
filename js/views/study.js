import { planQueue, Session } from '../session.js'
import { previewIntervals, GRADE, GRADE_LABEL } from '../scheduler.js'
import { cardChips, scopeLabel, qs, pct } from '../ui.js'
import { esc, shuffle, fmtDuration, startOfDay, addDays } from '../util.js'
import { scopeFromQuery } from './home.js'

export const title = () => 'Study'

const LETTERS = 'ABCDEFGH'

export function render(ctx, route, root) {
  const { deck, store } = ctx
  const settings = store.getSettings()
  const lo = ctx.levelOpts()
  const q = route.query
  const scope = scopeFromQuery(q)
  const sessionOpts = { fuzz: true, ...lo }

  const plan = planQueue({
    deck, getCard: ctx.getCard, settings, scope, now: ctx.now(), masteryOpts: lo,
    extraNew: Number(q.get('extra')) || 0, ahead: q.get('ahead') === '1',
  })
  const session = new Session({
    plan, deck, options: sessionOpts,
    getCard: ctx.getCard, putCard: store.putCard, deleteCard: store.deleteCard, popLog: store.popLog, addLog: store.addLog,
  })
  const total = plan.main.length + plan.learning.length

  // Per-card presentation state
  let card = null
  let phase = 'question' // 'question' | 'answered'
  let order = []
  let selected = new Set()
  let result = null // { correct: bool|null }
  let shownAt = 0

  function present(c) {
    card = c
    phase = 'question'
    selected = new Set()
    result = null
    shownAt = Date.now()
    order = Object.keys(c.options ?? {})
    if (c.kind === 'mcq' && settings.shuffleOptions && !c.fixedOrder) order = shuffle(order)
    draw()
  }

  function nextCard() {
    const c = session.next(ctx.now())
    if (!c) return finish()
    present(c)
  }

  const flipMode = () => card.kind !== 'mcq' || settings.mode === 'flip'

  function head() {
    const r = session.remaining
    const cur = card ? (ctx.getCard(card.id)?.s ?? 'new') : ''
    const on = (k, active) => (active ? ' class="on"' : '')
    return `<div class="study-head">
      <a class="btn link" href="#/" data-act="exit">← Exit</a>
      <div class="study-counts" aria-label="Cards remaining">
        <span class="n-new"${on('new', cur === 'new')}>${r.new} new</span>
        <span class="n-learn"${on('learn', cur === 'learn' || cur === 'relearn')}>${r.learning} learning</span>
        <span class="n-rev"${on('rev', cur === 'review')}>${r.review} review</span>
      </div>
      <button class="btn link" data-act="undo" ${session.canUndo ? '' : 'disabled'} title="Undo last answer (Z)">Undo</button>
    </div>`
  }

  function optionsHtml() {
    const correctKeys = new Set(card.answer)
    const multi = card.answer.length > 1
    const li = order.map((key, i) => {
      const letter = LETTERS[i]
      const text = esc(card.options[key])
      if (phase === 'answered') {
        const isCorrect = correctKeys.has(key)
        const picked = selected.has(key)
        const cls = isCorrect ? (picked || flipMode() ? 'correct' : 'missed') : picked ? 'wrong' : ''
        const tag = isCorrect ? (picked || flipMode() ? '✓ Correct' : '✓ Correct answer') : picked ? '✗ Your answer' : ''
        return `<li><div class="opt ${cls}"><span class="k">${letter}</span><span>${text}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</div></li>`
      }
      if (flipMode()) return `<li><div class="opt"><span class="k">${letter}</span><span>${text}</span></div></li>`
      return `<li><button class="opt${selected.has(key) ? ' selected' : ''}" data-key="${key}" aria-pressed="${selected.has(key)}"><span class="k">${letter}</span><span>${text}</span></button></li>`
    }).join('')
    return `<ul class="opts" ${multi && phase === 'question' && !flipMode() ? 'role="group" aria-label="Select all that apply"' : ''}>${li}</ul>`
  }

  function explanationHtml() {
    const [why, others] = card.explanation
    return `<div class="explain"><h3>Why this is right</h3><p>${esc(why)}</p>${others ? `<div class="sub"></div><h3>Why the others are not</h3><p>${esc(others)}</p>` : ''}</div>`
  }

  function gradeButtons() {
    const st = ctx.getCard(card.id)
    const base = st ?? { id: card.id, s: 'new', step: 0, ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, streak: 0, first: 0, last: 0 }
    const labels = previewIntervals(base, ctx.now(), sessionOpts)
    const allowed = result?.correct === false ? [1] : result?.correct === true ? [2, 3, 4] : [1, 2, 3, 4]
    return `<div class="grades" role="group" aria-label="How well did you know it?">${allowed.map(g =>
      `<button class="grade g${g}" data-grade="${g}"><span>${result?.correct === false ? 'Continue' : GRADE_LABEL[g]}</span><small>${labels[g]}</small><span class="kbd">${result?.correct === false ? 'Enter' : g}</span></button>`
    ).join('')}</div>`
  }

  function draw() {
    if (!card) return
    let body
    if (card.kind === 'mcq') {
      const multi = card.answer.length > 1
      const verdict = phase === 'answered' && result.correct !== null
        ? `<div class="verdict ${result.correct ? 'ok' : 'no'}" role="status">${result.correct ? 'Correct' : 'Not quite'}</div>` : ''
      let controls
      if (phase === 'question') {
        controls = flipMode()
          ? `<button class="btn primary lg" data-act="reveal">Show answer <span class="kbd">Space</span></button>`
          : multi ? `<button class="btn primary lg" data-act="check" ${selected.size === card.answer.length ? '' : 'disabled'}>Check answer <span class="kbd">Enter</span></button>` : ''
      } else controls = gradeButtons()
      body = `${cardChips(deck, card)}
        <p class="qtext">${esc(card.question)}</p>
        ${multi && phase === 'question' ? `<p class="hint">Select ${card.answer.length}</p>` : ''}
        ${verdict}${optionsHtml()}
        ${phase === 'answered' ? explanationHtml() : ''}
        ${controls}`
    } else {
      const label = card.kind === 'service' ? 'Which AWS service is this?' : 'Concept'
      let back = ''
      if (phase === 'answered') {
        back = card.kind === 'service'
          ? `<div class="answerbox"><div class="name">${esc(card.name)}</div></div><div class="explain"><p>${esc(card.notes)}</p>${card.vs ? `<p class="muted small"><b>Don't confuse:</b> ${esc(card.vs)}</p>` : ''}</div>`
          : `<div class="answerbox"><p style="margin:0">${esc(card.back)}</p></div>`
      }
      body = `${cardChips(deck, card)}
        <p class="hint" style="margin-top:12px">${label}</p>
        <p class="qtext" style="margin-top:0">${esc(card.front)}</p>
        ${back}
        ${phase === 'question' ? `<button class="btn primary lg" data-act="reveal">Show answer <span class="kbd">Space</span></button>` : gradeButtons()}`
    }
    root.innerHTML = `${head()}<section class="card qcard" aria-live="polite">${body}</section>`
    root.querySelector('.grade.g3, [data-grade], [data-act="reveal"], [data-act="check"]')?.focus({ preventScroll: true })
  }

  function reveal(correct = null) {
    if (phase !== 'question') return
    phase = 'answered'
    result = { correct }
    draw()
  }

  function submitChoice() {
    const right = card.answer.length === selected.size && card.answer.every(k => selected.has(k))
    reveal(right)
  }

  function grade(g) {
    if (phase !== 'answered') return
    session.answer(card, g, ctx.now(), { correct: result.correct, ms: Date.now() - shownAt })
    nextCard()
  }

  function finish() {
    card = null
    const s = session.stats
    const now = ctx.now()
    const upcoming = deck.cards
      .map(c => ctx.getCard(c.id))
      .filter(st => st && st.s !== 'new' && !st.suspended && st.due > now)
      .map(st => st.due)
    const tomorrow = addDays(now, 1)
    const dueTomorrow = deck.cards.filter(c => { const st = ctx.getCard(c.id); return st && st.s === 'review' && !st.suspended && st.due >= tomorrow && st.due < addDays(now, 2) }).length
    const more = planQueue({ deck, getCard: ctx.getCard, settings, scope, now, masteryOpts: lo })
    const nextAt = upcoming.length ? fmtDuration(Math.min(...upcoming) - now) : null
    root.innerHTML = `<section class="card done">
      <div class="big" aria-hidden="true">${s.answered ? '🎉' : '✅'}</div>
      <h2>${s.answered ? 'Session complete' : 'Nothing to study right now'}</h2>
      <p class="muted">${esc(scopeLabel(deck, scope))}</p>
      ${s.answered ? `<div class="stat-grid">
        <div class="stat"><b>${s.answered}</b><span>cards answered</span></div>
        <div class="stat"><b>${s.graded ? pct(s.correct / s.graded) : '—'}</b><span>answered correctly</span></div>
        <div class="stat"><b>${s.newSeen}</b><span>new cards learned</span></div>
        <div class="stat"><b>${s.again}</b><span>to revisit soon</span></div>
      </div>` : ''}
      <p class="muted small">${dueTomorrow ? `${dueTomorrow} card${dueTomorrow === 1 ? '' : 's'} due tomorrow. ` : ''}${nextAt ? `Next card comes due in ${nextAt}.` : ''}</p>
      <div class="actions" style="justify-content:center">
        <a class="btn primary" href="#/">Back to Today</a>
        ${more.newAvailable ? `<a class="btn" href="#/study${qs({ ...Object.fromEntries(q), extra: (Number(q.get('extra')) || 0) + 10 })}">Learn 10 more new cards</a>` : ''}
        ${more.futureCount ? `<a class="btn" href="#/study${qs({ ...scope, ahead: 1 })}">Study ahead</a>` : ''}
      </div></section>`
    root.querySelector('a.primary')?.focus({ preventScroll: true })
  }

  function onClick(e) {
    const t = e.target.closest('[data-key],[data-grade],[data-act]')
    if (!t || !root.contains(t)) return
    if (t.dataset.key) {
      if (phase !== 'question') return
      toggle(t.dataset.key)
    } else if (t.dataset.grade) grade(Number(t.dataset.grade))
    else if (t.dataset.act === 'reveal') reveal(null)
    else if (t.dataset.act === 'check') submitChoice()
    else if (t.dataset.act === 'undo') undo()
  }

  function toggle(key) {
    if (phase !== 'question' || flipMode()) return
    const need = card.answer.length
    if (need === 1) {
      selected = new Set([key])
      submitChoice()
      return
    }
    if (selected.has(key)) selected.delete(key)
    else if (selected.size < need) selected.add(key)
    draw()
  }

  function undo() {
    const back = session.undo()
    if (back) present(back)
  }

  function onKey(e) {
    if (!card || e.metaKey || e.ctrlKey || e.altKey) return
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return
    const k = e.key
    if (k === 'z' || k === 'Z') return void (session.canUndo && (e.preventDefault(), undo()))
    if (phase === 'question') {
      if (!flipMode() && card.kind === 'mcq') {
        const i = LETTERS.indexOf(k.toUpperCase())
        if (k.length === 1 && i >= 0 && i < order.length) { e.preventDefault(); return toggle(order[i]) }
        if (k === 'Enter' && card.answer.length > 1 && selected.size === card.answer.length) { e.preventDefault(); return submitChoice() }
      } else if (k === ' ' || k === 'Enter') { e.preventDefault(); return reveal(null) }
    } else {
      if (result.correct === false) { if (k === 'Enter' || k === ' ' || k === '1') { e.preventDefault(); grade(1) } return }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); return grade(3) }
      if (/^[1-4]$/.test(k) && !(result.correct === true && k === '1')) { e.preventDefault(); grade(Number(k)) }
    }
  }

  root.addEventListener('click', onClick)
  document.addEventListener('keydown', onKey)

  if (!total) finish()
  else nextCard()

  return () => {
    root.removeEventListener('click', onClick)
    document.removeEventListener('keydown', onKey)
  }
}
