import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDeck, filterCards, summarize, forecast, tally, masteryScore } from '../js/deck.js'
import { planQueue, Session, interleave, introducedToday } from '../js/session.js'
import { createStore, DEFAULT_SETTINGS, APP_ID } from '../js/store.js'
import { GRADE } from '../js/scheduler.js'
import { DAY, MIN, addDays } from '../js/util.js'

const questions = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url)))
const modules = JSON.parse(readFileSync(new URL('../data/modules.json', import.meta.url)))
const deck = buildDeck(questions, modules)
const NOW = new Date(2026, 5, 1, 10, 0).getTime()

function memStorage() {
  const m = new Map()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}
function fresh() {
  const store = createStore(memStorage())
  const get = id => store.getCard(id)
  return { store, get }
}
function run(store, plan, now = NOW) {
  return new Session({ plan, getCard: store.getCard, putCard: store.putCard, deleteCard: store.deleteCard, popLog: store.popLog, addLog: store.addLog, options: { fuzz: false }, deck })
}

test('deck: all cards have a valid domain and unique ids', () => {
  assert.equal(new Set(deck.cards.map(c => c.id)).size, deck.cards.length)
  for (const c of deck.cards) assert.ok([1, 2, 3, 4].includes(c.domain), c.id)
  assert.equal(deck.cards.filter(c => c.kind === 'mcq').length, 1050)
})

test('data: every question has a valid answer and 2-paragraph explanation', () => {
  for (const q of questions) {
    assert.ok(q.answer.length >= 1 && q.answer.every(k => k in q.options), q.id)
    assert.ok(q.explanation.length >= 1, q.id)
  }
})

test('data: service clues never contain the service name verbatim', () => {
  for (const s of modules.services) {
    const bare = s.name.replace(/^(AWS|Amazon)\s+/, '').replace(/\s*\(.*\)/, '')
    assert.ok(!s.clue.includes(s.name) && !s.clue.includes(bare), `${s.id}: "${bare}" appears in clue`)
  }
})

test('plan: a fresh deck offers exactly the daily new-card limit', () => {
  const { store, get } = fresh()
  const plan = planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 15 }, now: NOW })
  assert.equal(plan.main.length, 15)
  assert.equal(new Set(plan.main.map(c => c.id)).size, 15)
})

test('plan: weighted new cards roughly follow exam domain weights', () => {
  const { get } = fresh()
  const plan = planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 400 }, now: NOW })
  const counts = [1, 2, 3, 4].map(d => plan.main.filter(c => c.domain === d).length / 400)
  assert.ok(counts[3] < counts[2], 'domain 4 (12%) should be rarer than domain 3 (34%)')
  assert.ok(Math.abs(counts[2] - 0.34) < 0.12, `domain 3 share ${counts[2]}`)
})

test('plan: introduced-today cards count against the daily limit', () => {
  const { store, get } = fresh()
  const settings = { ...DEFAULT_SETTINGS, newPerDay: 5 }
  let session = run(store, planQueue({ deck, getCard: get, settings, now: NOW }))
  for (let i = 0; i < 3; i++) session.answer(session.next(NOW), GRADE.EASY, NOW)
  assert.equal(introducedToday(deck, get, NOW), 3)
  const plan = planQueue({ deck, getCard: get, settings, now: NOW + MIN })
  assert.equal(plan.main.length, 2)
  const more = planQueue({ deck, getCard: get, settings, now: NOW + MIN, extraNew: 10 })
  assert.equal(more.main.length, 12)
})

test('plan: scope limits the queue to a task statement', () => {
  const { get } = fresh()
  const plan = planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 500 }, scope: { task: '3.6' }, now: NOW })
  assert.ok(plan.main.length > 20)
  assert.ok(plan.main.every(c => c.task === '3.6'))
})

test('session: Again keeps the card in the session; graduating removes it', () => {
  const { store, get } = fresh()
  const session = run(store, planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 1 }, now: NOW }))
  const card = session.next(NOW)
  session.answer(card, GRADE.AGAIN, NOW, { correct: false })
  assert.equal(session.remaining.learning, 1)
  // learning card is due in 1 minute; with nothing else queued, learn-ahead still serves it
  assert.equal(session.next(NOW).id, card.id)
  session.answer(card, GRADE.GOOD, NOW + MIN, { correct: true })
  session.answer(card, GRADE.GOOD, NOW + 11 * MIN, { correct: true })
  assert.equal(get(card.id).s, 'review')
  assert.equal(session.next(NOW + 12 * MIN), null)
  assert.deepEqual(session.stats, { answered: 3, correct: 2, graded: 3, newSeen: 1, again: 1 })
})

test('session: due learning cards take priority over the main queue', () => {
  const { store, get } = fresh()
  const session = run(store, planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 3 }, now: NOW }))
  const first = session.next(NOW)
  session.answer(first, GRADE.AGAIN, NOW)
  assert.notEqual(session.next(NOW).id, first.id, 'not due yet, so move on')
  assert.equal(session.next(NOW + 2 * MIN).id, first.id, 'due now, so it comes back first')
})

test('plan: due reviews come before future ones; study-ahead only fills when nothing is due', () => {
  const { store, get } = fresh()
  const ids = deck.cards.slice(0, 3).map(c => c.id)
  const mk = (id, due) => ({ id, s: 'review', step: 0, ease: 2.5, ivl: 5, due, reps: 2, lapses: 0, streak: 2, first: NOW - 9 * DAY, last: NOW - 5 * DAY })
  store.putCard(mk(ids[0], addDays(NOW, 0)))
  store.putCard(mk(ids[1], addDays(NOW, -2)))
  store.putCard(mk(ids[2], addDays(NOW, 3)))
  const settings = { ...DEFAULT_SETTINGS, newPerDay: 0 }
  const plan = planQueue({ deck, getCard: get, settings, now: NOW })
  assert.deepEqual(plan.main.map(c => c.id), [ids[1], ids[0]])
  assert.equal(plan.futureCount, 1)

  store.putCard(mk(ids[0], addDays(NOW, 4)))
  store.putCard(mk(ids[1], addDays(NOW, 6)))
  const none = planQueue({ deck, getCard: get, settings, now: NOW })
  assert.equal(none.main.length, 0)
  const ahead = planQueue({ deck, getCard: get, settings, now: NOW, ahead: true })
  assert.deepEqual(ahead.main.map(c => c.id), [ids[2], ids[0], ids[1]])
})

test('suspended cards are excluded from queues and counts', () => {
  const { store, get } = fresh()
  const target = deck.cards[0]
  store.putCard({ id: target.id, s: 'new', step: 0, ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, streak: 0, first: 0, last: 0, suspended: true })
  const plan = planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 5000 }, now: NOW })
  assert.ok(!plan.main.some(c => c.id === target.id))
  assert.equal(tally(deck.cards, get, NOW).total, deck.cards.length - 1)
})

test('interleave spreads new cards evenly', () => {
  const out = interleave(['r1', 'r2', 'r3', 'r4'], ['n1', 'n2'])
  assert.equal(out.length, 6)
  assert.deepEqual(out.filter(x => x[0] === 'r'), ['r1', 'r2', 'r3', 'r4'])
  assert.ok(out[0][0] === 'r' && out[5][0] === 'r')
  assert.deepEqual(interleave(['r1'], []), ['r1'])
  assert.deepEqual(interleave([], ['n1', 'n2']), ['n1', 'n2'])
})

test('summary: counts, forecast and mastery score', () => {
  const { store, get } = fresh()
  const mk = (id, ivl, due) => ({ id, s: 'review', step: 0, ease: 2.5, ivl, due, reps: 3, lapses: 0, streak: 3, first: NOW - 30 * DAY, last: NOW - DAY })
  store.putCard(mk(deck.cards[0].id, 30, addDays(NOW, 20)))
  store.putCard(mk(deck.cards[1].id, 8, addDays(NOW, 2)))
  store.putCard(mk(deck.cards[2].id, 2, addDays(NOW, 0)))
  const sum = summarize(deck, get, NOW)
  assert.equal(sum.all.nailed, 1)
  assert.equal(sum.all.familiar, 1)
  assert.equal(sum.all.learning, 1)
  assert.equal(sum.all.new, deck.cards.length - 3)
  assert.equal(sum.all.due, 1)
  assert.deepEqual(forecast(deck, get, NOW, 4), [1, 0, 1, 0])
  assert.ok(masteryScore(sum.all) > 0 && masteryScore(sum.all) < 0.01)
  // per-domain totals add up to the whole
  assert.equal(Object.values(sum.byDomain).reduce((s, c) => s + c.total, 0), deck.cards.length)
})

test('filter: status and search', () => {
  const { store, get } = fresh()
  store.putCard({ id: deck.cards[0].id, s: 'review', step: 0, ease: 2.0, ivl: 3, due: NOW, reps: 6, lapses: 3, streak: 0, first: NOW - DAY, last: NOW })
  assert.deepEqual(filterCards(deck, { status: 'struggling' }, get, NOW).map(c => c.id), [deck.cards[0].id])
  const hits = filterCards(deck, { search: 'dynamodb' }, get, NOW)
  assert.ok(hits.length > 3)
})

test('store: persists to storage and reloads', () => {
  const storage = memStorage()
  const a = createStore(storage)
  a.putCard({ id: 'q001', s: 'review', step: 0, ease: 2.5, ivl: 5, due: NOW, reps: 1, lapses: 0, streak: 1, first: NOW, last: NOW })
  a.addLog([NOW, 'q001', 3, 1, 4000])
  a.patchSettings({ newPerDay: 7 })
  const b = createStore(storage)
  assert.equal(b.getCard('q001').ivl, 5)
  assert.equal(b.getLog().length, 1)
  assert.equal(b.getSettings().newPerDay, 7)
  assert.equal(b.persistent, true)
})

test('store: survives corrupt data and unavailable storage', () => {
  const storage = memStorage()
  storage.setItem(`${APP_ID}:v1`, '{not json')
  assert.doesNotThrow(() => createStore(storage))
  const blocked = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() {} }
  const s = createStore(blocked)
  assert.equal(s.persistent, false)
  s.putCard({ id: 'x', s: 'new', step: 0, ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, streak: 0, first: 0, last: 0 })
  assert.ok(s.getCard('x'))
})

test('store: export/import round trip, merge keeps the newer copy', () => {
  const a = createStore(memStorage())
  const card = (ivl, last) => ({ id: 'q001', s: 'review', step: 0, ease: 2.5, ivl, due: NOW, reps: 1, lapses: 0, streak: 1, first: NOW - DAY, last })
  a.putCard(card(10, NOW))
  a.addLog([NOW, 'q001', 3, 1, 1000])
  const backup = JSON.parse(JSON.stringify(a.exportData()))

  const b = createStore(memStorage())
  b.putCard(card(3, NOW - 5 * DAY))
  b.importData(backup, 'merge')
  assert.equal(b.getCard('q001').ivl, 10)

  const c = createStore(memStorage())
  c.putCard(card(99, NOW + DAY))
  c.importData(backup, 'merge')
  assert.equal(c.getCard('q001').ivl, 99, 'newer local copy wins on merge')
  c.importData(backup, 'replace')
  assert.equal(c.getCard('q001').ivl, 10)

  assert.throws(() => c.importData({ app: 'other', cards: [] }), /not a backup/)
})

test('session: undo restores card state, log, queue position and stats', () => {
  const { store, get } = fresh()
  const session = run(store, planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 3 }, now: NOW }))
  const first = session.next(NOW)

  session.answer(first, GRADE.EASY, NOW, { correct: true })
  assert.equal(get(first.id).s, 'review')
  assert.equal(store.getLog().length, 1)
  assert.equal(session.canUndo, true)

  const back = session.undo()
  assert.equal(back.id, first.id)
  assert.equal(get(first.id), undefined, 'a never-seen card goes back to untouched')
  assert.equal(store.getLog().length, 0)
  assert.equal(session.next(NOW).id, first.id)
  assert.deepEqual(session.stats, { answered: 0, correct: 0, graded: 0, newSeen: 0, again: 0 })
  assert.equal(session.canUndo, false)

  // undo of a second answer restores the intermediate learning state
  session.answer(first, GRADE.GOOD, NOW, { correct: true })
  const afterFirst = get(first.id)
  session.answer(first, GRADE.GOOD, NOW + 10 * MIN, { correct: true })
  assert.equal(get(first.id).s, 'review')
  session.undo()
  assert.deepEqual(get(first.id), afterFirst)
  assert.equal(session.remaining.learning, 1)
})

import { studyStreak, dailyCounts, accuracy, reviewedToday } from '../js/analytics.js'

test('analytics: streak, daily counts, accuracy', () => {
  const at = (d, h = 12) => new Date(2026, 5, 10 - d, h).getTime()
  const now = at(0, 9)
  const log = [[at(2), 'a', 3, 1, 0], [at(1), 'b', 1, 0, 0], [at(1, 13), 'c', 3, -1, 0], [at(0, 8), 'd', 2, -1, 0]]
  assert.equal(studyStreak(log, now), 3)
  assert.equal(studyStreak(log.slice(0, 2), now), 2, 'today empty: streak counts back from yesterday')
  assert.equal(studyStreak([[at(3), 'a', 3, 1, 0]], now), 0)
  const daily = dailyCounts(log, now, 4)
  assert.deepEqual(daily.map(d => [d.total, d.correct]), [[0, 0], [1, 1], [2, 1], [1, 0]])
  assert.equal(reviewedToday(log, now), 1)
  assert.deepEqual(accuracy(log), { total: 4, right: 2, rate: 0.5 })
})
