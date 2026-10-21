// Builds the study queue and runs a study session.

import { review, isDue, mastery, isStruggling, DEFAULTS } from './scheduler.js'
import { filterCards } from './deck.js'
import { startOfDay, addDays, shuffle, MIN } from './util.js'

export const LEARN_AHEAD = 20 * MIN

/** How many cards were first seen today, across the whole deck (this is the daily "new" budget). */
export function introducedToday(deck, getCard, now) {
  const start = startOfDay(now)
  const end = addDays(now, 1)
  let n = 0
  for (const c of deck.cards) {
    const st = getCard(c.id)
    if (st && st.first >= start && st.first < end) n++
  }
  return n
}

function pickNew(pool, count, deck, order, rand) {
  if (order === 'ordered') {
    const rank = new Map(deck.cards.map((c, i) => [c.id, i]))
    return pool.slice().sort((a, b) => rank.get(a.id) - rank.get(b.id)).slice(0, count)
  }
  // Weighted: draw a domain by exam weight, then a random unseen card from it.
  const weights = new Map(deck.domains.map(d => [d.id, d.weight]))
  const buckets = new Map()
  for (const c of shuffle(pool, rand)) {
    if (!buckets.has(c.domain)) buckets.set(c.domain, [])
    buckets.get(c.domain).push(c)
  }
  const out = []
  while (out.length < count && buckets.size) {
    const total = [...buckets.keys()].reduce((s, d) => s + (weights.get(d) ?? 1), 0)
    let r = rand() * total
    let chosen
    for (const d of buckets.keys()) {
      r -= weights.get(d) ?? 1
      if (r <= 0) { chosen = d; break }
    }
    chosen ??= [...buckets.keys()][0]
    out.push(buckets.get(chosen).pop())
    if (!buckets.get(chosen).length) buckets.delete(chosen)
  }
  return out
}

/** Spread `news` evenly through `reviews` so a session is not all-review then all-new. */
export function interleave(reviews, news) {
  if (!news.length) return reviews.slice()
  const total = reviews.length + news.length
  const slots = new Set(news.map((_, i) => Math.min(total - 1, Math.floor(((i + 1) * total) / (news.length + 1)))))
  const out = []
  let ri = 0, ni = 0
  for (let i = 0; i < total; i++) {
    if (slots.has(i) && ni < news.length) out.push(news[ni++])
    else if (ri < reviews.length) out.push(reviews[ri++])
    else out.push(news[ni++])
  }
  return out
}

/**
 * Decide what a session will contain.
 * @param opts.scope     filter (see filterCards)
 * @param opts.extraNew  introduce this many new cards beyond the daily limit
 * @param opts.ahead     if nothing is due, pull forward the soonest-due review cards
 */
export function planQueue({ deck, getCard, settings, scope = {}, now, rand = Math.random, extraNew = 0, ahead = false, masteryOpts }) {
  const inScope = filterCards(deck, scope, getCard, now, masteryOpts).filter(c => !getCard(c.id)?.suspended)
  const learning = []
  const dueReview = []
  const futureReview = []
  const unseen = []

  for (const c of inScope) {
    const st = getCard(c.id)
    if (!st || st.s === 'new') unseen.push(c)
    else if (st.s === 'review') (isDue(st, now) ? dueReview : futureReview).push(c)
    else if (isDue(st, now, LEARN_AHEAD)) learning.push(c)
  }

  dueReview.sort((a, b) => getCard(a.id).due - getCard(b.id).due)
  const budget = Math.max(0, settings.newPerDay - introducedToday(deck, getCard, now)) + extraNew
  const news = pickNew(unseen, Math.min(budget, unseen.length), deck, settings.newOrder, rand)

  let reviews = dueReview
  if (ahead && !dueReview.length && !learning.length) {
    reviews = futureReview.sort((a, b) => getCard(a.id).due - getCard(b.id).due).slice(0, 20)
  }

  return {
    learning,
    main: interleave(reviews, news),
    newAvailable: unseen.length,
    newBudget: budget,
    futureCount: futureReview.length,
  }
}

/**
 * Pick `count` practice questions for a test: due reviews first (struggling ones
 * leading), then never-seen questions, then the soonest-due of the rest. Unlike
 * flashcard sessions there is no daily new-card limit, so a long test is possible.
 */
export function planTest({ deck, getCard, settings, scope = {}, now, count, rand = Math.random, masteryOpts }) {
  const pool = filterCards(deck, { ...scope, kind: 'mcq' }, getCard, now, masteryOpts).filter(c => !getCard(c.id)?.suspended)
  const due = [], unseen = [], future = []
  for (const c of pool) {
    const st = getCard(c.id)
    if (!st || st.s === 'new') unseen.push(c)
    else if (isDue(st, now, LEARN_AHEAD)) due.push(c)
    else future.push(c)
  }
  const rank = c => (isStruggling(getCard(c.id), masteryOpts) ? 0 : 1)
  due.sort((a, b) => rank(a) - rank(b) || getCard(a.id).due - getCard(b.id).due)
  future.sort((a, b) => getCard(a.id).due - getCard(b.id).due)

  const picked = due.slice(0, count)
  if (picked.length < count) picked.push(...pickNew(unseen, count - picked.length, deck, settings.newOrder, rand))
  if (picked.length < count) picked.push(...future.slice(0, count - picked.length))
  return {
    cards: shuffle(picked, rand),
    available: { total: pool.length, due: due.length, unseen: unseen.length, future: future.length },
  }
}

/** A "go through these now" queue: everything given that is not nailed or suspended, shuffled. */
export function planForced(cards, { getCard, masteryOpts, rand = Math.random }) {
  return shuffle(cards.filter(c => {
    const st = getCard(c.id)
    return !st?.suspended && mastery(st, masteryOpts) !== 'nailed'
  }), rand)
}

export class Session {
  constructor({ plan, getCard, putCard, deleteCard, popLog, addLog, options = {}, deck, requeue = true }) {
    this.deck = deck
    this.requeue = requeue
    this.getCard = getCard
    this.putCard = putCard
    this.deleteCard = deleteCard
    this.popLog = popLog
    this.addLog = addLog
    this.options = options
    this.main = plan.main.slice()
    this.learning = new Map(plan.learning.map(c => [c.id, c]))
    this.stats = { answered: 0, correct: 0, graded: 0, newSeen: 0, again: 0 }
    this.history = []
  }

  get remaining() {
    const newLeft = this.main.filter(c => !this.#state(c).first).length
    return { new: newLeft, review: this.main.length - newLeft, learning: this.learning.size }
  }

  #state(card) {
    return this.getCard(card.id) ?? { first: 0 }
  }

  /** The next card to show, or null when the session is finished. */
  next(now) {
    const dueLearning = [...this.learning.values()]
      .filter(c => this.getCard(c.id).due <= now)
      .sort((a, b) => this.getCard(a.id).due - this.getCard(b.id).due)
    if (dueLearning.length) return dueLearning[0]
    if (this.main.length) return this.main[0]
    const ahead = [...this.learning.values()]
      .filter(c => this.getCard(c.id).due <= now + LEARN_AHEAD)
      .sort((a, b) => this.getCard(a.id).due - this.getCard(b.id).due)
    return ahead[0] ?? null
  }

  /**
   * Record an answer. `correct` is true/false for quiz answers or null when the
   * card was self-graded (flip mode / concept cards).
   */
  answer(card, grade, now, { correct = null, ms = 0 } = {}) {
    const before = this.getCard(card.id)
    const isNew = !before || before.s === 'new'
    const base = before ?? { id: card.id, s: 'new', step: 0, ease: DEFAULTS.startEase, ivl: 0, due: 0, reps: 0, lapses: 0, streak: 0, first: 0, last: 0 }
    const after = review(base, grade, now, this.options)

    this.putCard(after)
    this.addLog([now, card.id, grade, correct === null ? -1 : correct ? 1 : 0, ms])

    const idx = this.main.findIndex(c => c.id === card.id)
    this.history.push({ card, before, fromMain: idx !== -1, isNew, grade, correct })
    if (idx !== -1) this.main.splice(idx, 1)
    if (this.requeue && (after.s === 'learn' || after.s === 'relearn')) this.learning.set(card.id, card)
    else this.learning.delete(card.id)

    this.stats.answered++
    if (isNew) this.stats.newSeen++
    if (grade === 1) this.stats.again++
    if (correct !== null) { this.stats.graded++; if (correct) this.stats.correct++ }
    return after
  }

  get canUndo() {
    return this.history.length > 0
  }

  /** Revert the last answer (card state, log entry, queue position, stats). Returns the card to show again. */
  undo() {
    const h = this.history.pop()
    if (!h) return null
    if (h.before) this.putCard(h.before)
    else this.deleteCard(h.card.id)
    this.popLog()

    if (this.requeue && h.before && (h.before.s === 'learn' || h.before.s === 'relearn')) this.learning.set(h.card.id, h.card)
    else this.learning.delete(h.card.id)
    if (h.fromMain) this.main.unshift(h.card)

    this.stats.answered--
    if (h.isNew) this.stats.newSeen--
    if (h.grade === 1) this.stats.again--
    if (h.correct !== null) { this.stats.graded--; if (h.correct) this.stats.correct-- }
    return h.card
  }
}
