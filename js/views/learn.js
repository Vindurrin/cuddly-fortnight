import { summarize, tally, masteryScore } from '../deck.js'
import { mastery, isStruggling } from '../scheduler.js'
import { masteryBar, legend, statusChip, pct, qs, domainName } from '../ui.js'
import { esc } from '../util.js'

const EXAM_GUIDE = 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html'

export function title(ctx, route) {
  const id = route.parts[0]
  const t = id && ctx.deck.tasks.find(t => t.id === id)
  return t ? `${t.id} ${t.name}` : 'Learn'
}

export function render(ctx, route, root) {
  const id = route.parts[0]
  const task = id && ctx.deck.tasks.find(t => t.id === id)
  if (task) return renderTask(ctx, task, root)
  return renderIndex(ctx, root)
}

function renderIndex(ctx, root) {
  const { deck } = ctx
  const sum = summarize(deck, ctx.getCard, ctx.now(), ctx.levelOpts())
  root.innerHTML = `
    <h1>Learn</h1>
    <p class="muted">One module per task statement in the official CLF-C02 exam guide. Each pulls together the services and concepts to know, your progress, and a shortcut to study just that topic.</p>
    ${deck.domains.map(d => `
      <section class="card">
        <div class="row between"><h2>Domain ${d.id}: ${esc(d.name)}</h2><span class="chip">${d.weight}% of exam</span></div>
        <div class="tasklist">
          ${deck.tasks.filter(t => t.domainId === d.id).map(t => {
            const c = sum.byTask[t.id]
            const n = k => deck.cards.filter(x => x.task === t.id && x.kind === k).length
            return `<a class="taskcard" href="#/learn/${t.id}">
              <span class="id">${t.id}</span><span><b>${esc(t.name)}</b><br><span class="muted small">${n('service')} services · ${n('concept')} concepts · ${n('mcq')} questions · ${pct(masteryScore(c))} mastered</span></span>
              ${masteryBar(c, true)}</a>`
          }).join('')}
          ${sum.untagged[d.id].total ? `<a class="taskcard" href="#/cards${qs({ domain: d.id, task: 'none' })}">
              <span class="id">·</span><span><b>Mixed questions</b><br><span class="muted small">${sum.untagged[d.id].total} questions in this domain that don't map cleanly to one task statement</span></span>
              ${masteryBar(sum.untagged[d.id], true)}</a>` : ''}
        </div>
      </section>`).join('')}
    ${legend()}
    <p class="muted small" style="margin-top:12px">Task statements come from the <a href="${EXAM_GUIDE}" target="_blank" rel="noopener">official exam guide</a>. Matching questions to a task statement is automatic (keyword-based), so a few questions may sit under a neighbouring topic.</p>`
}

function renderTask(ctx, task, root) {
  const { deck } = ctx
  const now = ctx.now()
  const lo = ctx.levelOpts()
  const get = ctx.getCard
  const domain = deck.domains.find(d => d.id === task.domainId)
  const cards = deck.cards.filter(c => c.task === task.id)
  const services = cards.filter(c => c.kind === 'service')
  const concepts = cards.filter(c => c.kind === 'concept')
  const questions = cards.filter(c => c.kind === 'mcq')
  const counts = tally(cards, get, now, lo)
  const idx = deck.tasks.findIndex(t => t.id === task.id)
  const prev = deck.tasks[idx - 1], next = deck.tasks[idx + 1]

  const chip = c => {
    const st = get(c.id)
    return statusChip(mastery(st, lo), isStruggling(st, lo))
  }

  root.innerHTML = `
    <div class="crumbs"><a href="#/learn">Learn</a> › Domain ${domain.id}: ${esc(domain.name)}</div>
    <h1>${task.id} ${esc(task.name)}</h1>
    <p class="muted">Domain ${domain.id} makes up ${domain.weight}% of the exam.</p>

    <section class="card">
      <div class="row between">
        <div style="flex:1;min-width:200px">${masteryBar(counts)}
          <p class="muted small" style="margin:6px 0 0">${counts.nailed} nailed · ${counts.familiar} familiar · ${counts.learning} learning · ${counts.new} new</p></div>
        <div class="actions">
          <a class="btn primary" href="#/study${qs({ task: task.id })}">Study this topic</a>
          ${questions.length ? `<a class="btn" href="#/cards${qs({ task: task.id, kind: 'mcq' })}">Browse ${questions.length} questions</a>` : ''}
        </div>
      </div>
    </section>

    ${concepts.length ? `<section class="card"><h2>Core concepts</h2>
      <p class="muted small">Try to answer from memory before you open each one.</p>
      ${concepts.map(c => `<details class="concept"><summary>${esc(c.front)} ${chip(c)}</summary><p>${esc(c.back)}</p></details>`).join('')}</section>` : ''}

    ${services.length ? `<section class="card"><h2>Services to know</h2>
      <p class="muted small">Each service below is also a flashcard: you will be shown the description and asked to name the service.</p>
      ${services.map(s => `<div class="svc"><h3>${esc(s.name)} ${chip(s)}</h3>
        <p style="margin:0 0 4px">${esc(s.front)}</p>
        <p class="muted small" style="margin:0">${esc(s.notes)}</p>
        ${s.vs ? `<p class="vs" style="margin:2px 0 0"><b>Don't confuse:</b> ${esc(s.vs)}</p>` : ''}
        ${deck.cards.some(q => q.kind === 'mcq' && q.services?.includes(s.serviceId)) ? `<a class="small" href="#/cards${qs({ service: s.serviceId, kind: 'mcq' })}">Practice questions mentioning this service</a>` : ''}
      </div>`).join('')}</section>` : ''}

    ${!services.length && !concepts.length ? '<section class="card"><p class="muted">This topic is covered through practice questions. Use <b>Study this topic</b> above.</p></section>' : ''}

    <section class="card"><h2>Go deeper</h2>
      <ul style="margin:0;padding-left:1.2rem">
        <li><a href="${EXAM_GUIDE}" target="_blank" rel="noopener">Official CLF-C02 exam guide</a> (what AWS says is in scope)</li>
        <li><a href="https://skillbuilder.aws/" target="_blank" rel="noopener">AWS Skill Builder</a> has free Cloud Practitioner learning content and an official practice question set</li>
      </ul></section>

    <div class="row between">
      ${prev ? `<a class="btn" href="#/learn/${prev.id}">← ${prev.id}</a>` : '<span></span>'}
      ${next ? `<a class="btn" href="#/learn/${next.id}">${next.id} →</a>` : '<span></span>'}
    </div>`
}
