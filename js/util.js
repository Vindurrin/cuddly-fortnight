export const MIN = 60 * 1000
export const DAY = 24 * 60 * MIN

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** Local midnight at the start of the day containing `ts`. */
export function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Local midnight `n` calendar days after the day containing `ts` (DST-safe). */
export function addDays(ts, n) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export function daysBetween(fromTs, toTs) {
  return Math.round((startOfDay(toTs) - startOfDay(fromTs)) / DAY)
}

export function dayKey(ts) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Short human label for a duration in ms: "<1m", "10m", "3h", "4d", "2mo". */
export function fmtDuration(ms) {
  if (ms < MIN) return '<1m'
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)}m`
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`
  const days = Math.round(ms / DAY)
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}
