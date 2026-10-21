import { planQueue } from '../session.js'
import { summarize, forecast, masteryScore } from '../deck.js'
import { studyStreak, reviewedToday } from '../analytics.js'
import { masteryBar, legend, pct, qs, scopeLabel } from '../ui.js'
import { esc, daysBetween } from '../util.js'

export const title = () => 'Today'

export function scopeFromQuery(q) {
  const scope = {}
  for (const k of ['domain', 'task', 'service', 'status', 'kind']) if (q.get(k)) scope[k] = q.get(k)
  return scope
}

function scopeValue(scope) {
  if (scope.task) return `task:${scope.task}`
  if (scope.domain) return `domain:${scope.domain}`
  if (scope.status) return `status:${scope.status}`
  return ''
}

export function render(ctx, route, root) {
  const { deck, store } = ctx
  const now = ctx.now()
  const lo = ctx.levelOpts()
  const scope = scopeFromQuery(route.query)
  const settings = store.getSettings()
  const get = ctx.getCard

  const plan = planQueue({ deck, getCard: get, settings, scope, now, masteryOpts: lo })
  const isNew = c => !get(c.id) || get(c.id).s === 'new'
  const newCount = plan.main.filter(isNew).length
  const learningDue = plan.learning.filter(c => get(c.id).due <= now).length
  const learningSoon = plan.learning.length - learningDue
  const dueCount = plan.main.length - newCount + learningDue
  const sum = summarize(deck, get, now, lo)
  const log = store.getLog()
  const streak = studyStreak(log, now)
  const doneToday = reviewedToday(log, now)
  const fc = forecast(deck, get, now, 7)
  const examDays = settings.examDate ? daysBetween(now, new Date(`${settings.examDate}T00:00:00`).getTime()) : null
  const firstRun = sum.all.new === sum.all.total

  const scopeOptions = `
    <option value="">All topics</option>
    ${deck.domains.map(d => `<optgroup label="Domain ${d.id}: ${esc(d.name)}">
      <option value="domain:${d.id}">All of domain ${d.id}</option>
      ${deck.tasks.filter(t => t.domainId === d.id).map(t => `<option value="task:${t.id}">${t.id} ${esc(t.name)}</option>`).join('')}
    </optgroup>`).join('')}
    ${sum.all.struggling ? `<option value="status:struggling">Struggling cards (${sum.all.struggling})</option>` : ''}`

  const nothingToDo = dueCount + newCount + learningSoon === 0
  const startHref = `#/study${qs(scope)}`

  const weak = deck.tasks
    .map(t => ({ t, c: sum.byTask[t.id] }))
    .filter(x => x.c.total >= 5 && masteryScore(x.c) < 0.9)
    .sort((a, b) => masteryScore(a.c) - masteryScore(b.c))
    .slice(0, 3)

  const maxFc = Math.max(1, ...fc)
  const weekday = i => new Date(now + i * 86400000).toLocaleDateString(undefined, { weekday: 'short' })

  root.innerHTML = `
    ${firstRun ? `<div class="card"><h2>Welcome</h2>
      <p>This deck has <b>${sum.all.total}</b> cards for the CLF-C02 exam: ${deck.cards.filter(c => c.kind === 'mcq').length} practice questions, ${deck.cards.filter(c => c.kind === 'service').length} service flashcards and ${deck.cards.filter(c => c.kind === 'concept').length} core-concept cards.</p>
      <p class="muted small" style="margin:0">Answer each card, then say how well you knew it. Cards you miss come back soon; cards you know come back after longer and longer gaps. Cards turn <b>nailed</b> once they are scheduled ${lo.nailedDays}+ days out. Set your exam date in <a href="#/settings">Settings</a> so reviews are paced to fit.</p></div>` : ''}

    <section class="card hero" aria-labelledby="today-h">
      <h2 id="today-h" class="muted small" style="text-transform:uppercase;letter-spacing:.06em">${esc(scopeLabel(deck, scope))}</h2>
      <div class="counts">
        <div class="count due"><b>${dueCount}</b><span>To review</span></div>
        <div class="count new"><b>${newCount}</b><span>New</span></div>
      </div>
      ${nothingToDo ? `
        <p><b>All caught up.</b> ${plan.futureCount ? `${plan.futureCount} card${plan.futureCount === 1 ? ' is' : 's are'} scheduled for later.` : ''}</p>
        <div class="actions" style="justify-content:center">
          ${plan.futureCount ? `<a class="btn primary" href="#/study${qs({ ...scope, ahead: 1 })}">Study ahead</a>` : ''}
          ${plan.newAvailable ? `<a class="btn" href="#/study${qs({ ...scope, extra: 10 })}">Learn 10 more new cards</a>` : ''}
        </div>` : `<a class="btn primary lg" href="${startHref}" id="start">Start studying</a>`}
      ${learningSoon && dueCount + newCount ? `<p class="muted small" style="margin:10px 0 0">+ ${learningSoon} card${learningSoon === 1 ? '' : 's'} in short learning steps, back within 20 minutes</p>` : ''}
      <div class="scope"><label class="small muted" for="scope">Study:</label>
        <select id="scope">${scopeOptions}</select></div>
      <div class="meta-line">
        <span>${doneToday} reviewed today</span>
        <span>${streak ? `🔥 ${streak}-day streak` : 'No streak yet'}</span>
        ${examDays !== null ? `<span>${examDays > 0 ? `${examDays} day${examDays === 1 ? '' : 's'} until your exam` : examDays === 0 ? 'Exam day. Good luck!' : 'Exam date has passed'}</span>` : `<a href="#/settings">Set exam date</a>`}
      </div>
    </section>

    <section class="card" aria-labelledby="mastery-h">
      <div class="row between" style="align-items:flex-start">
        <div><h2 id="mastery-h">Mastery by exam domain</h2>
          <p class="muted small">Domains are listed with their weight on the real exam.</p></div>
        <div style="text-align:right"><div class="score">${pct(sum.examScore)}</div><div class="muted small">weighted mastery</div></div>
      </div>
      ${deck.domains.map(d => {
        const c = sum.byDomain[d.id]
        return `<div class="drow">
          <div><a class="name" href="#/learn">${d.id}. ${esc(d.name)}</a> <span class="muted small">· ${d.weight}% of exam</span></div>
          <a class="btn sm" href="#/study${qs({ domain: d.id })}">Study</a>
          ${masteryBar(c)}
          <div class="muted small" style="grid-column:1/-1">${c.nailed} nailed · ${c.familiar} familiar · ${c.learning} learning · ${c.new} new${c.struggling ? ` · <b>${c.struggling} struggling</b>` : ''}</div>
        </div>`
      }).join('')}
      <div style="margin-top:8px">${legend()}</div>
    </section>

    <div class="grid two">
      <section class="card" aria-labelledby="fc-h">
        <h2 id="fc-h">Coming up</h2>
        <div class="bars">${fc.map((n, i) => `<div class="bar" title="${n} due ${i === 0 ? 'today' : weekday(i)}"><span>${n}</span><i style="height:${Math.max(2, (n / maxFc) * 60)}px"></i><span>${i === 0 ? 'Today' : weekday(i)}</span></div>`).join('')}</div>
      </section>
      <section class="card" aria-labelledby="focus-h">
        <h2 id="focus-h">Focus next</h2>
        ${sum.all.struggling ? `<p><a class="btn sm" href="#/study?status=struggling">Review ${sum.all.struggling} struggling card${sum.all.struggling === 1 ? '' : 's'}</a></p>` : ''}
        ${weak.length ? weak.map(({ t, c }) => `<div class="row between nowrap" style="margin-bottom:8px"><div class="small" style="flex:1"><b>${t.id}</b> ${esc(t.name)}<div class="muted">${pct(masteryScore(c))} mastered</div></div><a class="btn sm" href="#/study${qs({ task: t.id })}">Study</a></div>`).join('') : '<p class="muted small">Topics you need most will show up here once you have started.</p>'}
      </section>
    </div>`

  const sel = root.querySelector('#scope')
  sel.value = scopeValue(scope)
  sel.addEventListener('change', () => {
    const [k, v] = sel.value.split(':')
    location.hash = `#/${qs(k ? { [k]: v } : {})}`
  })
}
