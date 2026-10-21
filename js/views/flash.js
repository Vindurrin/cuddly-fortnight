import { planQueue, planForced } from '../session.js'
import { filterCards, notecardsFor, weakQuestions, NOTECARD_KINDS } from '../deck.js'
import { scopeFromQuery, scopeLabel, qs } from '../ui.js'
import { runSession } from './runner.js'

export const title = () => 'Notecards'

/**
 * Notecard sessions come in two flavours:
 *   - the review queue (no params, or a scope): what is due, plus a few new cards per day
 *   - a focus session (force, focus=<question ids>, weak=1): everything linked to a topic or to
 *     recently missed questions, regardless of schedule
 */
export function render(ctx, route, root) {
  const { deck, store } = ctx
  const q = route.query
  const now = ctx.now()
  const lo = ctx.levelOpts()
  const scope = scopeFromQuery(q)
  const settings = store.getSettings()
  let cards, learning = [], label, exitHref = '#/study', empty

  if (q.get('weak') === '1' || q.get('focus')) {
    const source = q.get('weak') === '1'
      ? weakQuestions(deck, ctx.getCard, lo)
      : q.get('focus').split(',').map(id => deck.byId.get(id)).filter(Boolean)
    cards = planForced(notecardsFor(deck, source), { getCard: ctx.getCard, masteryOpts: lo })
    label = 'Notecards for what you missed'
    empty = 'You already know the notecards behind these'
  } else if (q.get('force') === '1') {
    cards = planForced(filterCards(deck, { ...scope, kind: NOTECARD_KINDS }, ctx.getCard, now, lo), { getCard: ctx.getCard, masteryOpts: lo })
    label = `Notecards · ${scopeLabel(deck, scope)}`
    empty = 'You have nailed every notecard in this topic'
  } else {
    const plan = planQueue({
      deck, getCard: ctx.getCard, settings, scope: { ...scope, kind: NOTECARD_KINDS }, now, masteryOpts: lo,
      extraNew: Number(q.get('extra')) || 0, ahead: q.get('ahead') === '1',
    })
    cards = plan.main
    learning = plan.learning
    label = `Notecards · ${scopeLabel(deck, scope)}`
    empty = 'No notecards due right now'
    if (!cards.length && !learning.length) {
      root.innerHTML = `<div class="session"><section class="card done"><h2>${empty}</h2>
        <p class="muted">${plan.futureCount ? `${plan.futureCount} are scheduled for later.` : ''}${plan.newAvailable ? ` ${plan.newAvailable} new ones are waiting, beyond today's limit.` : ''}</p>
        <div class="actions" style="justify-content:center">
          ${plan.newAvailable ? `<a class="btn primary" href="#/flash${qs({ ...scope, extra: 10 })}">Learn 10 more</a>` : ''}
          ${plan.futureCount ? `<a class="btn" href="#/flash${qs({ ...scope, ahead: 1 })}">Study ahead</a>` : ''}
          <a class="btn" href="#/study">Back to Study</a></div></section></div>`
      return
    }
  }

  const next = []
  if (scope.task) next.push({ href: `#/test/run${qs({ task: scope.task, n: 10 })}`, label: 'Quiz me on this topic' }, { href: `#/study/${scope.task}`, label: 'Back to topic' })
  else next.push({ href: '#/test', label: 'Take a test' }, { href: '#/study', label: 'Back to Study' })
  return runSession(ctx, root, { mode: 'flash', cards, learning, label, exitHref, next, empty })
}
