// The Study section: notecards plus one reading page per exam task statement.

import { summarize, tally, masteryScore, NOTECARD_KINDS } from '../deck.js'
import { planQueue } from '../session.js'
import { mastery, isStruggling } from '../scheduler.js'
import { masteryBar, legend, statusChip, pct, qs, weakCallout } from '../ui.js'
import { esc } from '../util.js'

const EXAM_GUIDE = 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html'

export function title(ctx, route) {
  const t = route.parts[0] && ctx.deck.tasks.find(t => t.id === route.parts[0])
  return t ? `${t.id} ${t.name}` : 'Study'
}

export function render(ctx, route, root) {
  const task = route.parts[0] && ctx.deck.tasks.find(t => t.id === route.parts[0])
  return task ? renderTask(ctx, task, root) : renderIndex(ctx, root)
}

export function notecardCounts(ctx, scope = {}) {
  const now = ctx.now()
  const plan = planQueue({ deck: ctx.deck, getCard: ctx.getCard, settings: ctx.settings, scope: { ...scope, kind: NOTECARD_KINDS }, now, masteryOpts: ctx.levelOpts() })
  const isNew = c => !ctx.getCard(c.id) || ctx.getCard(c.id).s === 'new'
  const fresh = plan.main.filter(isNew).length
  const learningDue = plan.learning.filter(c => ctx.getCard(c.id).due <= now).length
  return { due: plan.main.length - fresh + learningDue, fresh, later: plan.futureCount, newAvailable: plan.newAvailable }
}

function renderIndex(ctx, root) {
  const { deck } = ctx
  const lo = ctx.levelOpts()
  const sum = summarize(deck, ctx.getCard, ctx.now(), lo)
  const nc = notecardCounts(ctx)
  const ready = nc.due + nc.fresh
  const total = deck.cards.filter(c => c.kind !== 'mcq').length
  const n = (t, ...k) => deck.cards.filter(x => x.task === t && k.includes(x.kind)).length

  root.innerHTML = `
    <div class="pagehead"><h1>Study</h1><p>Notecards and a reading page for each topic on the exam.</p></div>
    ${weakCallout(ctx)}
    <section class="card">
      <div class="row between">
        <div><h2 style="margin-bottom:4px">Notecards</h2>
          <p class="muted" style="margin:0">${ready ? `${nc.due} due for review · ${nc.fresh} new today` : nc.later ? `All caught up. ${nc.later} scheduled for later.` : `${total} notecards to learn.`}</p></div>
        <div class="actions">
          ${ready ? `<a class="btn primary lg" href="#/flash">Study ${ready} notecard${ready === 1 ? '' : 's'}</a>`
            : nc.newAvailable ? `<a class="btn primary lg" href="#/flash?extra=10">Learn 10 more</a>` : ''}
          ${!ready && nc.later ? '<a class="btn" href="#/flash?ahead=1">Study ahead</a>' : ''}
        </div>
      </div>
    </section>

    ${deck.domains.map(d => `
      <section class="card">
        <div class="row between"><h2 style="margin:0">Domain ${d.id}: ${esc(d.name)}</h2><span class="chip">${d.weight}% of exam</span></div>
        <div class="tasklist" style="margin-top:18px">
          ${deck.tasks.filter(t => t.domainId === d.id).map(t => {
            const c = sum.byTask[t.id]
            return `<a class="taskcard" href="#/study/${t.id}">
              <span class="id">${t.id}</span><span><b>${esc(t.name)}</b><br><span class="muted small">${n(t.id, 'service', 'concept')} notecards · ${n(t.id, 'mcq')} questions · ${pct(masteryScore(c))} mastered</span></span>
              ${masteryBar(c, true)}</a>`
          }).join('')}
        </div>
      </section>`).join('')}
    ${legend()}
    <p class="muted small" style="margin-top:16px">Topics follow the <a href="${EXAM_GUIDE}" target="_blank" rel="noopener">official exam guide</a>. Matching questions to a topic is automatic, so a few may sit under a neighbouring one. <a href="#/cards?kind=mcq&task=none">Browse unmatched questions</a>.</p>`
}

function renderTask(ctx, task, root) {
  const { deck } = ctx
  const now = ctx.now(), lo = ctx.levelOpts(), get = ctx.getCard
  const domain = deck.domains.find(d => d.id === task.domainId)
  const cards = deck.cards.filter(c => c.task === task.id)
  const services = cards.filter(c => c.kind === 'service')
  const concepts = cards.filter(c => c.kind === 'concept')
  const questions = cards.filter(c => c.kind === 'mcq')
  const notecards = [...services, ...concepts]
  const counts = tally(cards, get, now, lo)
  const open = notecards.filter(c => mastery(get(c.id), lo) !== 'nailed').length
  const idx = deck.tasks.findIndex(t => t.id === task.id)
  const prev = deck.tasks[idx - 1], next = deck.tasks[idx + 1]
  const chip = c => statusChip(mastery(get(c.id), lo), isStruggling(get(c.id), lo))

  root.innerHTML = `
    <div class="crumbs"><a href="#/study">Study</a> › Domain ${domain.id}: ${esc(domain.name)}</div>
    <div class="pagehead"><h1>${task.id} ${esc(task.name)}</h1><p>Domain ${domain.id} is ${domain.weight}% of the exam.</p></div>

    <section class="card">
      ${masteryBar(counts)}
      <p class="muted small" style="margin:8px 0 20px">${counts.nailed} nailed · ${counts.familiar} familiar · ${counts.learning} learning · ${counts.new} new</p>
      <div class="actions">
        ${notecards.length ? `<a class="btn primary" href="#/flash${qs({ task: task.id, force: 1 })}">${open ? `Study ${open} notecard${open === 1 ? '' : 's'}` : 'Review notecards'}</a>` : ''}
        ${questions.length ? `<a class="btn" href="#/test/run${qs({ task: task.id, n: Math.min(10, questions.length) })}">Test me on this topic</a>` : ''}
        ${questions.length ? `<a class="btn link" href="#/cards${qs({ task: task.id, kind: 'mcq' })}">Browse ${questions.length} questions</a>` : ''}
      </div>
    </section>

    ${concepts.length ? `<section class="card"><h2>Core concepts</h2>
      <p class="muted small">Try to answer from memory before you open each one.</p>
      ${concepts.map(c => `<details class="concept"><summary>${esc(c.front)} ${chip(c)}</summary><p>${esc(c.back)}</p></details>`).join('')}</section>` : ''}

    ${services.length ? `<section class="card"><h2>Services to know</h2>
      ${services.map(s => `<div class="svc"><h3>${esc(s.name)} ${chip(s)}</h3>
        <p style="margin:0 0 4px">${esc(s.front)}</p>
        <p class="muted small" style="margin:0">${esc(s.notes)}</p>
        ${s.vs ? `<p class="vs small" style="margin:4px 0 0"><b>Don't confuse:</b> ${esc(s.vs)}</p>` : ''}
        ${deck.cards.some(q => q.kind === 'mcq' && q.services?.includes(s.serviceId)) ? `<a class="small" href="#/cards${qs({ service: s.serviceId, kind: 'mcq' })}">Questions mentioning this service</a>` : ''}
      </div>`).join('')}</section>` : ''}

    ${!notecards.length ? '<section class="card"><p class="muted" style="margin:0">This topic is covered through practice questions. Use <b>Test me on this topic</b> above.</p></section>' : ''}

    <section class="card"><h2>Go deeper</h2>
      <ul style="margin:0;padding-left:1.2rem">
        <li><a href="${EXAM_GUIDE}" target="_blank" rel="noopener">Official CLF-C02 exam guide</a></li>
        <li><a href="https://skillbuilder.aws/" target="_blank" rel="noopener">AWS Skill Builder</a> for free Cloud Practitioner learning content</li>
      </ul></section>

    <div class="row between">
      ${prev ? `<a class="btn" href="#/study/${prev.id}">← ${prev.id}</a>` : '<span></span>'}
      ${next ? `<a class="btn" href="#/study/${next.id}">${next.id} →</a>` : '<span></span>'}
    </div>`
}
