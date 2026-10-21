// Pure helpers over the review log. Log entries are [timestamp, cardId, grade, correct, ms]
// where correct is 1 / 0 for quiz answers and -1 for self-graded cards.

import { addDays, startOfDay, dayKey } from './util.js'

/** Consecutive days with at least one review, ending today (or yesterday if today has none yet). */
export function studyStreak(log, now) {
  const days = new Set(log.map(e => dayKey(e[0])))
  let cursor = startOfDay(now)
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1)
  let n = 0
  while (days.has(dayKey(cursor))) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

/** [{ day: ts, total, correct }] for the last `days` days, oldest first. */
export function dailyCounts(log, now, days = 30) {
  const start = addDays(startOfDay(now), -(days - 1))
  const buckets = new Map()
  for (let i = 0; i < days; i++) buckets.set(dayKey(addDays(start, i)), { day: addDays(start, i), total: 0, correct: 0 })
  for (const e of log) {
    const b = buckets.get(dayKey(e[0]))
    if (!b) continue
    b.total++
    if (e[3] === 1 || (e[3] === -1 && e[2] >= 3)) b.correct++
  }
  return [...buckets.values()]
}

export function reviewedToday(log, now) {
  const start = startOfDay(now)
  let n = 0
  for (let i = log.length - 1; i >= 0 && log[i][0] >= start; i--) n++
  return n
}

/** Share of answers that were right. Quiz answers use correct; self-graded cards count Good/Easy as right. */
export function accuracy(log, sinceTs = 0) {
  let total = 0, right = 0
  for (const e of log) {
    if (e[0] < sinceTs) continue
    total++
    if (e[3] === 1 || (e[3] === -1 && e[2] >= 3)) right++
  }
  return { total, right, rate: total ? right / total : null }
}
