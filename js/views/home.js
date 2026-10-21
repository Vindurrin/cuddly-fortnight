import { planTest } from '../session.js'
import { summarize, forecast, masteryScore } from '../deck.js'
import { studyStreak, reviewedToday } from '../analytics.js'
import { masteryBar, legend, pct, qs, weakCallout } from '../ui.js'
import { esc, daysBetween } from '../util.js'
import { notecardCounts } from './study.js'

export const title = () => 'Home'

export function render(ctx, route, root) {
  const { deck, store } = ctx
  const now = ctx.now()
  const lo = ctx.levelOpts()
  const settings = store.getSettings()
  const get = ctx.getCard

  const sum = summarize(deck, get, now, lo)
  const log = store.getLog()
  const streak = studyStreak(log, now)
  const doneToday = reviewedToday(log, now)
  const fc = forecast(deck, get, now, 7)
  const examDays = settings.examDate ? daysBetween(now, new Date(`${settings.examDate}T00:00:00`).getTime()) : null
  const firstRun = sum.all.new === sum.all.total

  const test = planTest({ deck, getCard: get, settings, now, count: settings.testLength, masteryOpts: lo })
  const nc = notecardCounts(ctx)
  const ready = nc.due + nc.fresh
  const maxFc = Math.max(1, ...fc)
  const weekday = i => new Date(now + i * 86400000).toLocaleDateString(undefined, { weekday: 'short' })
  const q = deck.cards.filter(c => c.kind === 'mcq').length

  root.innerHTML = `
    <div class="pagehead"><h1>${firstRun ? 'Welcome' : 'Today'}</h1>
      <div class="meta-line">
        ${examDays !== null ? `<span><b>${examDays > 0 ? `${examDays} day${examDays === 1 ? '' : 's'}` : examDays === 0 ? 'Exam day' : 'Exam date passed'}</b> ${examDays > 0 ? 'until your exam' : ''}</span>` : '<a href="#/settings">Set your exam date</a>'}
        <span>${doneToday} answered today</span>
        <span>${streak ? `${streak}-day streak` : 'No streak yet'}</span>
      </div></div>

    ${firstRun ? `<div class="card"><p style="margin:0"><b>How this works.</b> <b>Test</b> yourself with ${q} practice questions, or <b>Study</b> with notecards on the services and concepts. When you miss questions, you'll be sent to the notecards for those topics. Anything you get wrong comes back sooner; anything you know comes back less and less often.</p></div>` : ''}
    ${weakCallout(ctx)}

    <div class="tiles">
      <section class="tile" aria-labelledby="t-test">
        <span class="eyebrow">Practice questions</span>
        <h2 id="t-test">Take a test</h2>
        <div class="big">${test.available.due || test.available.unseen}</div>
        <p class="detail">${test.available.due ? `due for review, plus ${test.available.unseen} not seen yet` : `questions you haven't seen yet`}</p>
        <a class="btn primary lg" href="#/test/run${qs({ n: settings.testLength })}">Start ${Math.min(settings.testLength, test.available.total)} questions</a>
        <div class="alt"><a href="#/test">Choose length or topic</a></div>
      </section>
      <section class="tile" aria-labelledby="t-study">
        <span class="eyebrow">Notecards</span>
        <h2 id="t-study">Study</h2>
        <div class="big">${ready}</div>
        <p class="detail">${ready ? `${nc.due} due for review · ${nc.fresh} new today` : nc.later ? 'all caught up for now' : 'notecards to learn'}</p>
        ${ready ? `<a class="btn primary lg" href="#/flash">Study notecards</a>` : `<a class="btn lg" href="#/study">Browse topics</a>`}
        <div class="alt"><a href="#/study">Topics and reading</a></div>
      </section>
    </div>

    <section class="card" aria-labelledby="mastery-h">
      <div class="row between" style="align-items:flex-start;margin-bottom:8px">
        <div><h2 id="mastery-h" style="margin-bottom:2px">Progress by exam domain</h2>
          <p class="muted small" style="margin:0">Each domain with its weight on the real exam.</p></div>
        <div style="text-align:right"><div class="score">${pct(sum.examScore)}</div><div class="muted small">weighted mastery</div></div>
      </div>
      ${deck.domains.map(d => {
        const c = sum.byDomain[d.id]
        return `<div class="drow">
          <div><span class="name">${d.id}. ${esc(d.name)}</span> <span class="muted small">· ${d.weight}% of exam</span></div>
          <a class="btn sm" href="#/test/run${qs({ domain: d.id, n: settings.testLength })}">Test</a>
          ${masteryBar(c)}
          <div class="muted small sub">${c.nailed} nailed · ${c.familiar} familiar · ${c.learning} learning · ${c.new} new${c.struggling ? ` · <b>${c.struggling} struggling</b>` : ''}</div>
        </div>`
      }).join('')}
      <div style="margin-top:12px">${legend()}</div>
    </section>

    <section class="card" aria-labelledby="fc-h">
      <h2 id="fc-h">Coming up</h2>
      <div class="bars">${fc.map((n, i) => `<div class="bar" title="${n} due ${i === 0 ? 'today' : weekday(i)}"><span>${n}</span><i style="height:${Math.max(3, (n / maxFc) * 64)}px"></i><span>${i === 0 ? 'Today' : weekday(i)}</span></div>`).join('')}</div>
    </section>`
}
