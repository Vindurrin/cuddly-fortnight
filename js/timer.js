// Test timer. Counts time spent answering only: callers tick it with `running`
// false while the explanation is on screen or the tab is hidden.

/** The real exam allows 90 minutes for 65 questions (about 83 s each). */
export const PACE_MS_PER_QUESTION = Math.round((90 * 60 * 1000) / 65)

export const TIMER_MODES = { pace: 'Exam pace', stopwatch: 'Stopwatch', off: 'No timer' }

export const paceBudgetMs = n => n * PACE_MS_PER_QUESTION

export class Clock {
  /** @param budgetMs  total allowed answering time, or null for a count-up stopwatch */
  constructor(budgetMs = null, start = Date.now()) {
    this.budgetMs = budgetMs
    this.spent = 0
    this.last = start
  }

  tick(now, running) {
    if (running) this.spent += Math.max(0, now - this.last)
    this.last = now
    return this
  }

  get remaining() {
    return this.budgetMs === null ? null : Math.max(0, this.budgetMs - this.spent)
  }

  get expired() {
    return this.budgetMs !== null && this.spent >= this.budgetMs
  }
}

/** 83000 -> "1:23", 3725000 -> "1:02:05". */
export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "1h 12m", "12m", "45s" for summaries. */
export function fmtSpan(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
