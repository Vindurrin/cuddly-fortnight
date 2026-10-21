import { summarize, masteryScore } from '../deck.js'
import { dailyCounts, accuracy, studyStreak } from '../analytics.js'
import { masteryBar, legend, pct } from '../ui.js'
import { esc, addDays, startOfDay, DAY } from '../util.js'

export const title = () => 'Stats'

export function render(ctx, route, root) {
  const { deck, store } = ctx
  const now = ctx.now()
  const log = store.getLog()
  const sum = summarize(deck, ctx.getCard, now, ctx.levelOpts())
  const days = dailyCounts(log, now, 30)
  const max = Math.max(1, ...days.map(d => d.total))
  const since = addDays(startOfDay(now), -29)
  const acc30 = accuracy(log, since)
  const accAll = accuracy(log)
  const studied = new Set(log.map(e => startOfDay(e[0]))).size

  const byDomain = new Map(deck.domains.map(d => [d.id, { total: 0, right: 0 }]))
  for (const e of log) {
    if (e[0] < since) continue
    const c = deck.byId.get(e[1])
    if (!c) continue
    const b = byDomain.get(c.domain)
    b.total++
    if (e[3] === 1 || (e[3] === -1 && e[2] >= 3)) b.right++
  }

  const hardest = deck.cards
    .map(c => ({ c, st: ctx.getCard(c.id) }))
    .filter(x => x.st && x.st.lapses > 0)
    .sort((a, b) => b.st.lapses - a.st.lapses || a.st.ease - b.st.ease)
    .slice(0, 10)

  root.innerHTML = `
    <h1>Stats</h1>
    ${!log.length ? '<div class="card empty">Nothing here yet. Do a study session and your history will appear.</div>' : ''}
    <div class="stat-grid">
      <div class="stat"><b>${log.length}</b><span>total reviews</span></div>
      <div class="stat"><b>${studied}</b><span>days studied</span></div>
      <div class="stat"><b>${studyStreak(log, now)}</b><span>day streak</span></div>
      <div class="stat"><b>${acc30.rate === null ? '—' : pct(acc30.rate)}</b><span>correct, last 30 days</span></div>
      <div class="stat"><b>${pct(sum.examScore)}</b><span>weighted mastery</span></div>
    </div>

    <section class="card"><h2>Last 30 days</h2>
      <div class="bars thin" role="img" aria-label="Reviews per day over the last 30 days">
        ${days.map(d => `<div class="bar" title="${new Date(d.day).toLocaleDateString()}: ${d.total} reviews, ${d.correct} correct"><i style="height:${(d.total / max) * 100}px"></i></div>`).join('')}
      </div>
      <div class="row between muted small"><span>${new Date(days[0].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>Peak ${max} in a day</span><span>Today</span></div>
    </section>

    <section class="card"><h2>Your cards</h2>${masteryBar(sum.all)}
      <p class="muted small" style="margin:6px 0">${sum.all.nailed} nailed · ${sum.all.familiar} familiar · ${sum.all.learning} learning · ${sum.all.new} new${sum.all.suspended ? ` · ${sum.all.suspended} suspended` : ''}</p>${legend()}</section>

    <section class="card"><h2>Accuracy by domain <span class="muted small">(last 30 days)</span></h2>
      <table class="simple"><thead><tr><th>Domain</th><th>Answers</th><th>Correct</th><th>Mastery</th></tr></thead><tbody>
      ${deck.domains.map(d => {
        const b = byDomain.get(d.id)
        return `<tr><td>${d.id}. ${esc(d.name)}</td><td>${b.total}</td><td>${b.total ? pct(b.right / b.total) : '—'}</td><td>${pct(masteryScore(sum.byDomain[d.id]))}</td></tr>`
      }).join('')}</tbody></table></section>

    <section class="card"><h2>Hardest cards</h2>
      ${hardest.length ? `<table class="simple"><tbody>${hardest.map(({ c, st }) => `<tr><td>${esc((c.question ?? c.front).slice(0, 110))}${(c.question ?? c.front).length > 110 ? '…' : ''}</td><td style="white-space:nowrap">${st.lapses} lapse${st.lapses === 1 ? '' : 's'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Cards you forget will be listed here.</p>'}
    </section>`
}
