import test from 'node:test'
import assert from 'node:assert/strict'
import { review, newCard, GRADE, mastery, isStruggling, isDue, previewIntervals, maxIntervalForExam, DEFAULTS } from '../js/scheduler.js'
import { MIN, DAY, addDays } from '../js/util.js'

const T0 = new Date(2026, 5, 1, 10, 0, 0).getTime()
const noFuzz = { fuzz: false }
const r = (card, g, now = T0) => review(card, g, now, noFuzz)

test('new card: Good moves to the next learning step, then graduates to 1 day', () => {
  let c = r(newCard('a'), GRADE.GOOD)
  assert.equal(c.s, 'learn')
  assert.equal(c.step, 1)
  assert.equal(c.due, T0 + 10 * MIN)
  c = r(c, GRADE.GOOD, T0 + 10 * MIN)
  assert.equal(c.s, 'review')
  assert.equal(c.ivl, 1)
  assert.equal(c.due, addDays(T0 + 10 * MIN, 1))
})

test('new card: Again starts at the first step (1 minute)', () => {
  const c = r(newCard('a'), GRADE.AGAIN)
  assert.equal(c.s, 'learn')
  assert.equal(c.step, 0)
  assert.equal(c.due, T0 + 1 * MIN)
})

test('new card: Easy graduates immediately with the easy interval', () => {
  const c = r(newCard('a'), GRADE.EASY)
  assert.equal(c.s, 'review')
  assert.equal(c.ivl, DEFAULTS.easyInterval)
})

test('learning: Again resets to the first step, Hard repeats the current step', () => {
  let c = r(newCard('a'), GRADE.GOOD) // now on step 1
  c = r(c, GRADE.HARD, T0 + MIN)
  assert.equal(c.step, 1)
  assert.equal(c.due, T0 + MIN + 10 * MIN)
  c = r(c, GRADE.AGAIN, T0 + 12 * MIN)
  assert.equal(c.step, 0)
  assert.equal(c.due, T0 + 12 * MIN + 1 * MIN)
})

function graduated(ivl = 10, ease = 2.5) {
  return { ...newCard('a'), s: 'review', ivl, ease, due: T0, reps: 5, first: T0 - 20 * DAY }
}

test('review: Good multiplies the interval by ease', () => {
  const c = r(graduated(10), GRADE.GOOD)
  assert.equal(c.ivl, 25)
  assert.equal(c.ease, 2.5)
  assert.equal(c.due, addDays(T0, 25))
})

test('review: Hard grows slowly and lowers ease; Easy grows fast and raises ease', () => {
  const hard = r(graduated(10), GRADE.HARD)
  assert.equal(hard.ivl, 12)
  assert.ok(Math.abs(hard.ease - 2.35) < 1e-9)
  const easy = r(graduated(10), GRADE.EASY)
  assert.equal(easy.ivl, 33)
  assert.ok(Math.abs(easy.ease - 2.65) < 1e-9)
})

test('review: intervals always increase by at least a day for passing grades', () => {
  const c = r(graduated(1, 1.3), GRADE.HARD)
  assert.ok(c.ivl >= 2)
})

test('review: Again is a lapse - halves interval, drops ease, enters relearning', () => {
  const c = r(graduated(20), GRADE.AGAIN)
  assert.equal(c.s, 'relearn')
  assert.equal(c.lapses, 1)
  assert.equal(c.ivl, 10)
  assert.ok(Math.abs(c.ease - 2.3) < 1e-9)
  assert.equal(c.due, T0 + 10 * MIN)
  assert.equal(c.streak, 0)
})

test('relearning: Good returns to review at the reduced interval', () => {
  let c = r(graduated(20), GRADE.AGAIN)
  c = r(c, GRADE.GOOD, T0 + 10 * MIN)
  assert.equal(c.s, 'review')
  assert.equal(c.ivl, 10)
})

test('ease never drops below the floor', () => {
  let c = graduated(10, 1.35)
  for (let i = 0; i < 5; i++) c = r({ ...c, s: 'review' }, GRADE.AGAIN)
  assert.equal(c.ease, DEFAULTS.minEase)
})

test('overdue cards earn credit on Good', () => {
  const late = { ...graduated(10), due: T0 - 4 * DAY }
  const c = r(late, GRADE.GOOD)
  assert.equal(c.ivl, 30) // (10 + 4/2) * 2.5
})

test('maxInterval caps growth', () => {
  const c = review(graduated(200), GRADE.EASY, T0, { fuzz: false, maxInterval: 30 })
  assert.equal(c.ivl, 30)
})

test('fuzz stays within 5% and only applies to intervals of a week or more', () => {
  for (let i = 0; i < 200; i++) {
    const c = review(graduated(40), GRADE.GOOD, T0, {}, Math.random)
    assert.ok(c.ivl >= 95 && c.ivl <= 105, `ivl ${c.ivl}`)
  }
  assert.equal(review(graduated(2), GRADE.GOOD, T0, {}, Math.random).ivl, 5)
})

test('does not mutate its input', () => {
  const c = graduated(10)
  const snapshot = JSON.stringify(c)
  r(c, GRADE.GOOD)
  assert.equal(JSON.stringify(c), snapshot)
})

test('streak counts consecutive non-Again answers', () => {
  let c = r(newCard('a'), GRADE.GOOD)
  c = r(c, GRADE.GOOD, T0 + 10 * MIN)
  assert.equal(c.streak, 2)
  c = r(c, GRADE.AGAIN, T0 + 12 * MIN)
  assert.equal(c.streak, 0)
})

test('mastery ladder', () => {
  assert.equal(mastery(newCard('a')), 'new')
  assert.equal(mastery({ ...newCard('a'), s: 'learn' }), 'learning')
  assert.equal(mastery(graduated(3)), 'learning')
  assert.equal(mastery(graduated(7)), 'familiar')
  assert.equal(mastery(graduated(14)), 'nailed')
  assert.equal(mastery({ ...graduated(30), s: 'relearn' }), 'learning')
})

test('struggling: two or more lapses and not nailed', () => {
  assert.equal(isStruggling({ ...graduated(5), lapses: 2 }), true)
  assert.equal(isStruggling({ ...graduated(5), lapses: 1 }), false)
  assert.equal(isStruggling({ ...graduated(30), lapses: 3 }), false)
})

test('isDue: review cards are due all day, learning cards by the minute', () => {
  const now = new Date(2026, 5, 1, 9, 0).getTime()
  const laterToday = new Date(2026, 5, 1, 23, 0).getTime()
  const tomorrow = addDays(now, 1)
  assert.equal(isDue({ s: 'review', due: laterToday }, now), true)
  assert.equal(isDue({ s: 'review', due: tomorrow }, now), false)
  assert.equal(isDue({ s: 'learn', due: now + 5 * MIN }, now), false)
  assert.equal(isDue({ s: 'learn', due: now + 5 * MIN }, now, 20 * MIN), true)
  assert.equal(isDue(newCard('a'), now), false)
})

test('previewIntervals gives per-button labels', () => {
  const p = previewIntervals(graduated(10), T0)
  assert.equal(p[1], '10m')
  assert.ok(p[3].endsWith('d'))
  assert.deepEqual(Object.keys(previewIntervals(newCard('a'), T0)), ['1', '2', '3', '4'])
})

test('exam date caps intervals so cards come back before the exam', () => {
  const exam = addDays(T0, 20)
  assert.equal(maxIntervalForExam(exam, T0), 10)
  assert.equal(maxIntervalForExam(addDays(T0, 1), T0), 1)
  assert.equal(maxIntervalForExam(null, T0), DEFAULTS.maxInterval)
  assert.equal(maxIntervalForExam(addDays(T0, 900), T0), DEFAULTS.maxInterval)
})
