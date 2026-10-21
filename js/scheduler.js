// Spaced-repetition scheduler: an Anki/SM-2 style algorithm with learning steps.
//
// A card moves through four states:
//   new      never seen
//   learn    working through short learning steps (minutes)
//   review   graduated; reviewed at growing day intervals
//   relearn  lapsed from review; back through a short step, then returns to review
//
// Everything here is a pure function of (card, grade, now, options), so it can
// be tested without a browser or storage.

import { MIN, DAY, addDays, startOfDay, fmtDuration } from './util.js'

export const GRADE = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 }
export const GRADE_LABEL = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

export const DEFAULTS = {
  learningSteps: [1, 10], // minutes
  lapseSteps: [10], // minutes
  graduatingInterval: 1, // days, after finishing learning steps with Good
  easyInterval: 4, // days, when Easy graduates a card immediately
  startEase: 2.5,
  minEase: 1.3,
  hardMultiplier: 1.2,
  easyBonus: 1.3,
  lapseMultiplier: 0.5, // new interval after a lapse = old interval * this
  minLapseInterval: 1,
  maxInterval: 365, // days; lowered automatically when an exam date is set
  nailedDays: 14, // review interval at which a card counts as "nailed"
  familiarDays: 7,
  fuzz: true,
}

export function newCard(id) {
  return { id, s: 'new', step: 0, ease: DEFAULTS.startEase, ivl: 0, due: 0, reps: 0, lapses: 0, streak: 0, first: 0, last: 0 }
}

function fuzzed(days, opts, rand) {
  if (!opts.fuzz || days < 7) return days
  const spread = Math.max(1, Math.round(days * 0.05))
  return days + Math.floor(rand() * (2 * spread + 1)) - spread
}

function clampInterval(days, opts) {
  return Math.max(1, Math.min(opts.maxInterval, Math.round(days)))
}

/**
 * Apply a grade to a card and return the updated card (the input is not mutated).
 * `now` is a ms timestamp. `options` overrides DEFAULTS.
 */
export function review(card, grade, now, options = {}, rand = Math.random) {
  const opts = { ...DEFAULTS, ...options }
  const c = { ...card }
  c.reps += 1
  c.last = now
  if (!c.first) c.first = now
  c.streak = grade === GRADE.AGAIN ? 0 : c.streak + 1

  if (c.s === 'new' || c.s === 'learn') {
    if (c.s === 'new') c.step = 0
    c.s = 'learn'
    return stepThrough(c, grade, now, opts.learningSteps, opts, rand, () => {
      c.ease = c.ease || opts.startEase
      return grade === GRADE.EASY ? opts.easyInterval : opts.graduatingInterval
    })
  }

  if (c.s === 'relearn') {
    return stepThrough(c, grade, now, opts.lapseSteps, opts, rand, () => c.ivl)
  }

  // review state
  const overdue = Math.max(0, (startOfDay(now) - startOfDay(c.due)) / DAY)
  if (grade === GRADE.AGAIN) {
    c.lapses += 1
    c.ease = Math.max(opts.minEase, c.ease - 0.2)
    c.ivl = clampInterval(Math.max(opts.minLapseInterval, c.ivl * opts.lapseMultiplier), opts)
    c.s = 'relearn'
    c.step = 0
    c.due = now + opts.lapseSteps[0] * MIN
    return c
  }

  let next
  if (grade === GRADE.HARD) {
    next = Math.max(c.ivl + 1, c.ivl * opts.hardMultiplier)
    c.ease = Math.max(opts.minEase, c.ease - 0.15)
  } else if (grade === GRADE.GOOD) {
    next = Math.max(c.ivl + 1, (c.ivl + overdue / 2) * c.ease)
  } else {
    next = Math.max(c.ivl + 2, (c.ivl + overdue) * c.ease * opts.easyBonus)
    c.ease += 0.15
  }
  c.ivl = clampInterval(fuzzed(next, opts, rand), opts)
  c.due = addDays(now, c.ivl)
  return c
}

function stepThrough(c, grade, now, steps, opts, rand, graduateInterval) {
  if (grade === GRADE.AGAIN) {
    c.step = 0
    c.due = now + steps[0] * MIN
    return c
  }
  if (grade === GRADE.HARD) {
    c.due = now + steps[Math.min(c.step, steps.length - 1)] * MIN
    return c
  }
  if (grade === GRADE.GOOD && c.step + 1 < steps.length) {
    c.step += 1
    c.due = now + steps[c.step] * MIN
    return c
  }
  // Graduate (Good on the last step, or Easy at any step)
  c.s = 'review'
  c.step = 0
  c.ivl = clampInterval(graduateInterval(), opts)
  c.due = addDays(now, c.ivl)
  return c
}

/** Button labels for each grade, e.g. { 1: '10m', 2: '1d', 3: '3d', 4: '4d' }. */
export function previewIntervals(card, now, options = {}) {
  const out = {}
  for (const g of [1, 2, 3, 4]) {
    const next = review(card, g, now, { ...options, fuzz: false })
    out[g] = fmtDuration(next.due - now)
  }
  return out
}

/** Largest review interval that still leaves room for a review before the exam. */
export function maxIntervalForExam(examDate, now, fallback = DEFAULTS.maxInterval) {
  if (!examDate) return fallback
  const daysLeft = Math.round((startOfDay(examDate) - startOfDay(now)) / DAY)
  if (daysLeft <= 0) return 1
  return Math.max(1, Math.min(fallback, Math.floor(daysLeft / 2)))
}

/** Where a card sits on the "how well do I know this" ladder. */
export function mastery(card, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  if (!card || card.s === 'new') return 'new'
  if (card.s === 'learn' || card.s === 'relearn') return 'learning'
  if (card.ivl >= opts.nailedDays) return 'nailed'
  if (card.ivl >= opts.familiarDays) return 'familiar'
  return 'learning'
}

/** Cards that keep slipping: lapsed twice or more and not yet back to nailed. */
export function isStruggling(card, options = {}) {
  return !!card && card.lapses >= 2 && mastery(card, options) !== 'nailed'
}

/**
 * Showing difficulty right now: the last answer was a miss, or the card has lapsed
 * and has not yet been answered correctly three times in a row. Nailed cards are never weak.
 */
export function isWeak(card, options = {}) {
  if (!card || card.s === 'new' || card.reps === 0) return false
  if (mastery(card, options) === 'nailed') return false
  return card.streak === 0 || (card.lapses >= 1 && card.streak < 3)
}

export function isDue(card, now, aheadMs = 0) {
  if (!card || card.s === 'new') return false
  if (card.s === 'review') return card.due < addDays(now, 1)
  return card.due <= now + aheadMs
}
