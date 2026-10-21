import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDeck, filterCards, weakQuestions, notecardsFor, topicsOf } from '../js/deck.js'
import { planTest, planForced, planQueue, Session } from '../js/session.js'
import { createStore, DEFAULT_SETTINGS } from '../js/store.js'
import { GRADE, isWeak, newCard } from '../js/scheduler.js'
import { DAY, MIN, addDays } from '../js/util.js'

const deck = buildDeck(
  JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url))),
  JSON.parse(readFileSync(new URL('../data/modules.json', import.meta.url))),
)
const NOW = new Date(2026, 5, 1, 10, 0).getTime()
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const fresh = () => { const store = createStore(mem()); return { store, get: store.getCard } }
const mk = (id, over = {}) => ({ ...newCard(id), s: 'review', ivl: 5, due: NOW, reps: 3, first: NOW - 9 * DAY, last: NOW - DAY, streak: 3, ...over })
const mcq = deck.cards.filter(c => c.kind === 'mcq')

test('test plan: honours any length with no daily cap, questions only', () => {
  const { get } = fresh()
  const { cards, available } = planTest({ deck, getCard: get, settings: DEFAULT_SETTINGS, now: NOW, count: 65 })
  assert.equal(cards.length, 65)
  assert.ok(cards.every(c => c.kind === 'mcq'))
  assert.equal(new Set(cards.map(c => c.id)).size, 65)
  assert.equal(available.total, 1050)
})

test('test plan: due questions come first, then unseen, then future', () => {
  const { store, get } = fresh()
  store.putCard(mk(mcq[0].id, { due: addDays(NOW, -1) }))
  store.putCard(mk(mcq[1].id, { due: addDays(NOW, 9) }))
  const two = planTest({ deck, getCard: get, settings: DEFAULT_SETTINGS, now: NOW, count: 5 })
  assert.ok(two.cards.some(c => c.id === mcq[0].id), 'due card is included')
  assert.ok(!two.cards.some(c => c.id === mcq[1].id), 'future card is not used while unseen cards remain')
  const small = planTest({ deck, getCard: get, settings: DEFAULT_SETTINGS, now: NOW, count: 1 })
  assert.equal(small.cards[0].id, mcq[0].id)
})

test('test plan: scope narrows to a topic, and fills from later cards if short', () => {
  const { get } = fresh()
  const { cards, available } = planTest({ deck, getCard: get, settings: DEFAULT_SETTINGS, scope: { task: '1.4' }, now: NOW, count: 50 })
  assert.equal(cards.length, available.total)
  assert.ok(cards.every(c => c.task === '1.4'))
})

test('test plan: excludes suspended questions', () => {
  const { store, get } = fresh()
  store.putCard({ ...newCard(mcq[0].id), suspended: true })
  const { cards } = planTest({ deck, getCard: get, settings: DEFAULT_SETTINGS, now: NOW, count: 1050 })
  assert.equal(cards.length, 1049)
})

test('weak detection: last answer missed, or lapsed without a 3-streak; never when nailed', () => {
  assert.equal(isWeak(mk('a', { streak: 0 })), true)
  assert.equal(isWeak(mk('a', { lapses: 1, streak: 2 })), true)
  assert.equal(isWeak(mk('a', { lapses: 1, streak: 3 })), false)
  assert.equal(isWeak(mk('a', { streak: 4 })), false)
  assert.equal(isWeak(mk('a', { streak: 0, ivl: 30 })), false)
  assert.equal(isWeak(newCard('a')), false)
  assert.equal(isWeak({ ...newCard('a'), s: 'learn', reps: 1, streak: 0 }), true)
})

test('missed questions are linked to the notecards that explain them', () => {
  const { store, get } = fresh()
  const q = mcq.find(c => c.services.includes('s3') && c.task)
  store.putCard(mk(q.id, { streak: 0 }))
  const weak = weakQuestions(deck, get)
  assert.deepEqual(weak.map(c => c.id), [q.id])
  const notes = notecardsFor(deck, weak)
  assert.ok(notes.length > 0)
  assert.ok(notes.every(c => c.kind !== 'mcq'))
  assert.ok(notes.some(c => c.id === 'svc:s3'), 'service card for a mentioned service')
  assert.ok(notes.filter(c => c.kind === 'concept').every(c => c.task === q.task), 'concepts come from the question topic')
  assert.equal(topicsOf(deck, weak)[0].id, q.task)
})

test('forced plan skips nailed and suspended cards', () => {
  const { store, get } = fresh()
  const notes = deck.cards.filter(c => c.kind === 'service').slice(0, 4)
  store.putCard(mk(notes[0].id, { ivl: 30 }))
  store.putCard({ ...newCard(notes[1].id), suspended: true })
  const out = planForced(notes, { getCard: get })
  assert.deepEqual(out.map(c => c.id).sort(), [notes[2].id, notes[3].id].sort())
})

test('filter: comma-separated kinds, and the weak status', () => {
  const { store, get } = fresh()
  const both = filterCards(deck, { kind: 'service,concept' }, get, NOW)
  assert.equal(both.length, 158)
  store.putCard(mk(mcq[3].id, { streak: 0 }))
  assert.deepEqual(filterCards(deck, { status: 'weak' }, get, NOW).map(c => c.id), [mcq[3].id])
})

test('notecard queue (flashcards) stays limited by the daily new-card limit', () => {
  const { get } = fresh()
  const plan = planQueue({ deck, getCard: get, settings: { ...DEFAULT_SETTINGS, newPerDay: 10 }, scope: { kind: 'service,concept' }, now: NOW })
  assert.equal(plan.main.length, 10)
  assert.ok(plan.main.every(c => c.kind !== 'mcq'))
})

test('test session without requeue: a miss is not asked again within the test', () => {
  const { store, get } = fresh()
  const { cards } = planTest({ deck, getCard: get, settings: DEFAULT_SETTINGS, now: NOW, count: 2 })
  const s = new Session({ plan: { main: cards, learning: [] }, getCard: get, putCard: store.putCard, deleteCard: store.deleteCard, popLog: store.popLog, addLog: store.addLog, options: { fuzz: false }, deck, requeue: false })
  const a = s.next(NOW)
  s.answer(a, GRADE.AGAIN, NOW, { correct: false })
  assert.equal(s.remaining.learning, 0)
  const b = s.next(NOW)
  assert.notEqual(b.id, a.id)
  s.answer(b, GRADE.GOOD, NOW, { correct: true })
  assert.equal(s.next(NOW + MIN), null, 'test ends after each question is answered once')
  assert.equal(get(a.id).s, 'learn', 'but the miss is scheduled to return soon')
  s.undo()
  assert.equal(s.next(NOW).id, b.id)
})
