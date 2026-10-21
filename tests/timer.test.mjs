import test from 'node:test'
import assert from 'node:assert/strict'
import { Clock, fmtClock, fmtSpan, paceBudgetMs, PACE_MS_PER_QUESTION } from '../js/timer.js'

test('pace matches the real exam: 65 questions in about 90 minutes', () => {
  assert.ok(Math.abs(paceBudgetMs(65) - 90 * 60 * 1000) < 65)
  assert.equal(paceBudgetMs(10), 10 * PACE_MS_PER_QUESTION)
})

test('clock only counts time while running', () => {
  const c = new Clock(60_000, 0)
  c.tick(10_000, true)
  c.tick(40_000, false) // reading the explanation: paused
  c.tick(45_000, true)
  assert.equal(c.spent, 15_000)
  assert.equal(c.remaining, 45_000)
  assert.equal(c.expired, false)
})

test('clock expires at the budget and never reports negative time', () => {
  const c = new Clock(5_000, 0)
  c.tick(4_999, true)
  assert.equal(c.expired, false)
  c.tick(9_000, true)
  assert.equal(c.expired, true)
  assert.equal(c.remaining, 0)
})

test('stopwatch has no budget and never expires', () => {
  const c = new Clock(null, 0)
  c.tick(3_600_000, true)
  assert.equal(c.remaining, null)
  assert.equal(c.expired, false)
  assert.equal(c.spent, 3_600_000)
})

test('clock ignores time going backwards', () => {
  const c = new Clock(null, 1000)
  c.tick(500, true)
  assert.equal(c.spent, 0)
})

test('formatting', () => {
  assert.equal(fmtClock(83_000), '1:23')
  assert.equal(fmtClock(3_725_000), '1:02:05')
  assert.equal(fmtClock(0), '0:00')
  assert.equal(fmtClock(500), '0:01', 'rounds up so it never shows 0:00 while time remains')
  assert.equal(fmtSpan(45_000), '45s')
  assert.equal(fmtSpan(12 * 60_000 + 5_000), '12m 05s')
  assert.equal(fmtSpan(4_320_000), '1h 12m')
})
