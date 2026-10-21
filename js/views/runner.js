// Runs a card session in one of two modes:
//   test   questions only; answer, read the explanation, next. Misses are not re-asked in the same test.
//   flash  notecards; recall, reveal, rate yourself. Cards you miss come back within the session.

import { Session } from '../session.js'
import { previewIntervals, GRADE_LABEL } from '../scheduler.js'
import { notecardsFor, topicsOf } from '../deck.js'
import { cardChips, pct, taskName } from '../ui.js'
import { esc, shuffle } from '../util.js'
import { Clock, paceBudgetMs, fmtClock, fmtSpan } from '../timer.js'

const LETTERS = 'ABCDEFGH'
const BLANK = id => ({ id, s: 'new', step: 0, ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, streak: 0, first: 0, last: 0 })

/**
 * @param cfg.mode     'test' | 'flash'
 * @param cfg.cards    cards to run, in order
 * @param cfg.learning cards already in learning steps (flash only)
 * @param cfg.next     extra links for the flash finish screen: [{ href, label }]
 * @param cfg.timer    test only: 'pace' (countdown at exam pace) | 'stopwatch' | 'off'
 */
export function runSession(ctx, root, cfg) {
  const { deck, store } = ctx
  const settings = store.getSettings()
  const isTest = cfg.mode === 'test'
  const opts = { fuzz: true, ...ctx.levelOpts() }
  const total = cfg.cards.length + (cfg.learning?.length ?? 0)

  const timerMode = isTest ? cfg.timer ?? 'off' : 'off'
  const clock = timerMode === 'off' ? null : new Clock(timerMode === 'pace' ? paceBudgetMs(total) : null)

  const session = new Session({
    plan: { main: cfg.cards, learning: cfg.learning ?? [] }, deck, options: opts, requeue: !isTest,
    getCard: ctx.getCard, putCard: store.putCard, deleteCard: store.deleteCard, popLog: store.popLog, addLog: store.addLog,
  })

  let card = null
  let phase = 'question' // 'question' | 'answered'
  let order = []
  let selected = new Set()
  let result = null
  let shownAt = 0
  const results = [] // test mode: { card, correct }

  const header = () => {
    const r = session.remaining
    const left = r.new + r.review + r.learning
    const done = isTest ? results.length : Math.max(0, total - left)
    const label = isTest ? `Question ${Math.min(results.length + 1, total)} of ${total}` : `${left} left`
    return `<div class="run-head${clock ? ' timed' : ''}">
      <a class="btn link" href="${cfg.exitHref}" data-exit>← Exit</a>
      <div><div class="count" style="margin-bottom:6px">${label}</div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${(done / total) * 100}%"></i></div></div>
      ${clock ? `<div class="clock" data-clock title="${timerMode === 'pace' ? 'Time left. Pauses while you read explanations.' : 'Time spent answering. Pauses while you read explanations.'}"></div>` : ''}
      <button class="btn link" data-act="undo" ${session.canUndo ? '' : 'disabled'} title="Undo last answer (Z)">Undo</button>
    </div>`
  }

  const clockRunning = () => !!card && phase === 'question' && !document.hidden

  function paintClock() {
    const el = root.querySelector('[data-clock]')
    if (!el || !clock) return
    const low = timerMode === 'pace' && (clock.remaining < 60_000 || clock.remaining < clock.budgetMs * 0.1)
    el.textContent = timerMode === 'pace' ? fmtClock(clock.remaining) : fmtClock(clock.spent)
    el.classList.toggle('paused', !clockRunning())
    el.classList.toggle('low', low)
  }

  let ticker = null
  if (clock) {
    ticker = setInterval(() => {
      clock.tick(Date.now(), clockRunning())
      paintClock()
      if (clock.expired && clockRunning()) finishTest(true)
    }, 200)
  }

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
    if (!c) return isTest ? finishTest() : finishFlash()
    present(c)
  }

  function optionsHtml() {
    const correct = new Set(card.answer)
    return `<ul class="opts">${order.map((key, i) => {
      const letter = LETTERS[i], text = esc(card.options[key])
      if (phase === 'answered') {
        const isRight = correct.has(key), picked = selected.has(key)
        const cls = isRight ? (picked ? 'correct' : 'missed') : picked ? 'wrong' : ''
        const tag = isRight ? (picked ? '✓ Correct' : '✓ Right answer') : picked ? '✗ Your answer' : ''
        return `<li><div class="opt ${cls}"><span class="k">${letter}</span><span>${text}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</div></li>`
      }
      return `<li><button class="opt${selected.has(key) ? ' selected' : ''}" data-key="${key}" aria-pressed="${selected.has(key)}"><span class="k">${letter}</span><span>${text}</span></button></li>`
    }).join('')}</ul>`
  }

  function explanationHtml() {
    const [why, others] = card.explanation
    return `<div class="explain"><h3>Why this is right</h3><p>${esc(why)}</p>${others ? `<div class="sub"></div><h3>Why the others are not</h3><p>${esc(others)}</p>` : ''}</div>`
  }

  function drawTest() {
    const multi = card.answer.length > 1
    const isLast = session.main.length <= 1
    let controls = ''
    if (phase === 'question') {
      if (multi) controls = `<button class="btn primary lg" data-act="check" ${selected.size === card.answer.length ? '' : 'disabled'}>Check answer <span class="kbd">Enter</span></button>`
    } else {
      const nextLabel = isLast ? 'See results' : 'Next question'
      controls = result.correct
        ? `<div class="nextrow"><button class="btn primary lg" data-grade="3">${nextLabel} <span class="kbd">Enter</span></button>
            <button class="btn" data-grade="2" title="Counts as hard, so it comes back sooner">I guessed</button>
            <button class="btn" data-grade="4" title="Counts as easy, so it comes back later">Too easy</button></div>`
        : `<div class="nextrow"><button class="btn primary lg" data-grade="1">${nextLabel} <span class="kbd">Enter</span></button></div>`
    }
    const verdict = phase === 'answered' ? `<div class="verdict ${result.correct ? 'ok' : 'no'}" role="status">${result.correct ? 'Correct' : 'Not quite'}</div>` : ''
    return `${cardChips(deck, card)}
      <p class="qtext">${esc(card.question)}</p>
      ${multi && phase === 'question' ? `<p class="hint">Select ${card.answer.length}</p>` : ''}
      ${verdict}${optionsHtml()}${phase === 'answered' ? explanationHtml() : ''}${controls}`
  }

  function drawFlash() {
    const isService = card.kind === 'service'
    let back = '', controls
    if (phase === 'answered') {
      back = isService
        ? `<div class="answerbox"><div class="name">${esc(card.name)}</div></div><div class="explain"><p>${esc(card.notes)}</p>${card.vs ? `<p class="muted small"><b>Don't confuse:</b> ${esc(card.vs)}</p>` : ''}</div>`
        : `<div class="answerbox"><p style="margin:0;font-size:1.15rem">${esc(card.back)}</p></div>`
      const labels = previewIntervals(ctx.getCard(card.id) ?? BLANK(card.id), ctx.now(), opts)
      controls = `<div class="grades" role="group" aria-label="How well did you know it?">${[1, 2, 3, 4].map(g =>
        `<button class="grade g${g}" data-grade="${g}"><span>${GRADE_LABEL[g]}</span><small>${labels[g]}</small><span class="kbd">${g}</span></button>`).join('')}</div>`
    } else controls = `<button class="btn primary lg" data-act="reveal">Show answer <span class="kbd">Space</span></button>`
    return `${cardChips(deck, card)}
      <p class="hint" style="margin-top:20px">${isService ? 'Which AWS service is this?' : 'Concept'}</p>
      <p class="flashfront">${esc(card.front)}</p>${back}${controls}`
  }

  function draw() {
    root.innerHTML = `<div class="session">${header()}<section class="card qcard" aria-live="polite">${isTest ? drawTest() : drawFlash()}</section></div>`
    root.querySelector('.btn.primary, .grade.g3, [data-act="reveal"]')?.focus({ preventScroll: true })
    paintClock()
  }

  function reveal(correct = null) {
    if (phase !== 'question') return
    phase = 'answered'
    result = { correct }
    draw()
  }

  function submitChoice() {
    reveal(card.answer.length === selected.size && card.answer.every(k => selected.has(k)))
  }

  function toggle(key) {
    if (phase !== 'question' || !isTest) return
    const need = card.answer.length
    if (need === 1) { selected = new Set([key]); return submitChoice() }
    if (selected.has(key)) selected.delete(key)
    else if (selected.size < need) selected.add(key)
    draw()
  }

  function grade(g) {
    if (phase !== 'answered') return
    session.answer(card, g, ctx.now(), { correct: result.correct, ms: Date.now() - shownAt })
    if (isTest) results.push({ card, correct: result.correct })
    nextCard()
  }

  function undo() {
    const back = session.undo()
    if (!back) return
    if (isTest) results.pop()
    present(back)
  }

  function finishTest(timedOut = false) {
    clock?.tick(Date.now(), clockRunning())
    card = null
    clearInterval(ticker)
    const unanswered = total - results.length
    const missed = results.filter(r => !r.correct).map(r => r.card)
    const right = results.length - missed.length
    const topics = topicsOf(deck, missed).slice(0, 5)
    const notes = notecardsFor(deck, missed).filter(c => (ctx.getCard(c.id)?.ivl ?? 0) < ctx.levelOpts().nailedDays)
    const focus = missed.map(q => q.id).join(',')

    root.innerHTML = `<div class="session"><section class="card done">
      <p class="muted" style="margin-bottom:4px">${esc(cfg.label)}</p>
      ${timedOut ? `<p class="timeup"><b>Time's up.</b> ${results.length} of ${total} answered.</p>` : ''}
      <div class="big">${right} / ${total}</div>
      <p class="muted" style="font-size:1.1rem;margin-bottom:${clock ? '4px' : '1rem'}">${pct(right / total)} correct${unanswered ? ` · ${unanswered} unanswered` : ''}</p>
      ${clock && results.length ? `<p class="muted small">${fmtSpan(clock.spent)} answering${timerMode === 'pace' ? ` of ${fmtSpan(clock.budgetMs)} allowed` : ''} · about ${fmtSpan(clock.spent / results.length)} per question</p>` : ''}
      ${missed.length && notes.length ? `<div class="push"><p><b>Next: study the notecards behind what you missed.</b></p>
        <p class="muted small">${notes.length} notecard${notes.length === 1 ? '' : 's'} cover the services and concepts in the ${missed.length} question${missed.length === 1 ? '' : 's'} you got wrong.</p>
        <a class="btn primary lg" href="#/flash?focus=${focus}">Study ${notes.length} notecard${notes.length === 1 ? '' : 's'}</a></div>` : ''}
      ${topics.length ? `<div class="slipped"><h3>Where you slipped</h3>${topics.map(t => `<a class="t" href="#/study/${t.id}"><span><b>${t.id}</b> ${esc(t.name)}</span><span class="muted">${t.count} missed</span></a>`).join('')}</div>` : ''}
      ${missed.length ? `<details style="text-align:left;margin-bottom:24px"><summary style="cursor:pointer;font-weight:600">Review the ${missed.length} you missed</summary>
        ${missed.map(q => `<div class="item"><p style="margin:10px 0 6px"><b>${esc(q.question)}</b></p>
          <p class="small" style="color:var(--good);margin:0 0 6px">✓ ${q.answer.map(k => esc(q.options[k])).join(' · ')}</p>
          <p class="small muted" style="margin:0">${esc(q.explanation[0])}</p></div>`).join('')}</details>` : '<p>Perfect score. Nice work.</p>'}
      <div class="actions" style="justify-content:center"><a class="btn ${missed.length && notes.length ? '' : 'primary'}" href="#/test">Another test</a><a class="btn" href="#/">Back home</a></div>
    </section></div>`
  }

  function finishFlash() {
    card = null
    const s = session.stats
    root.innerHTML = `<div class="session"><section class="card done">
      <p class="muted" style="margin-bottom:4px">${esc(cfg.label)}</p>
      <h2 style="font-size:1.8rem">${s.answered ? 'Notecards done' : cfg.empty ?? 'No notecards to study right now'}</h2>
      ${s.answered ? `<div class="stat-grid"><div class="stat"><b>${s.answered}</b><span>cards answered</span></div>
        <div class="stat"><b>${s.newSeen}</b><span>new cards learned</span></div>
        <div class="stat"><b>${s.again}</b><span>to revisit soon</span></div></div>` : ''}
      <div class="actions" style="justify-content:center;margin-top:24px">
        ${(cfg.next ?? []).map((n, i) => `<a class="btn ${i === 0 ? 'primary' : ''}" href="${n.href}">${esc(n.label)}</a>`).join('')}
        <a class="btn" href="#/">Back home</a></div>
    </section></div>`
  }

  function onClick(e) {
    const t = e.target.closest('[data-key],[data-grade],[data-act]')
    if (!t || !root.contains(t)) return
    if (t.dataset.key) toggle(t.dataset.key)
    else if (t.dataset.grade) grade(Number(t.dataset.grade))
    else if (t.dataset.act === 'reveal') reveal(null)
    else if (t.dataset.act === 'check') submitChoice()
    else if (t.dataset.act === 'undo') undo()
  }

  function onKey(e) {
    if (!card || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return
    const k = e.key
    if (k === 'z' || k === 'Z') { if (session.canUndo) { e.preventDefault(); undo() } return }
    if (phase === 'question') {
      if (isTest) {
        const i = LETTERS.indexOf(k.toUpperCase())
        if (k.length === 1 && i >= 0 && i < order.length) { e.preventDefault(); toggle(order[i]) }
        else if (k === 'Enter' && card.answer.length > 1 && selected.size === card.answer.length) { e.preventDefault(); submitChoice() }
      } else if (k === ' ' || k === 'Enter') { e.preventDefault(); reveal(null) }
      return
    }
    if (isTest) {
      if (k === 'Enter' || k === ' ') { e.preventDefault(); grade(result.correct ? 3 : 1) }
      else if (result.correct && (k === '2' || k === '4')) { e.preventDefault(); grade(Number(k)) }
    } else if (k === 'Enter' || k === ' ') { e.preventDefault(); grade(3) }
    else if (/^[1-4]$/.test(k)) { e.preventDefault(); grade(Number(k)) }
  }

  root.addEventListener('click', onClick)
  document.addEventListener('keydown', onKey)
  nextCard()
  return () => {
    clearInterval(ticker)
    root.removeEventListener('click', onClick)
    document.removeEventListener('keydown', onKey)
  }
}
