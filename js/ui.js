import { esc } from './util.js'
import { KIND_LABEL } from './deck.js'

export const MASTERY_ORDER = ['nailed', 'familiar', 'learning', 'new']
export const MASTERY_LABEL = { new: 'New', learning: 'Learning', familiar: 'Familiar', nailed: 'Nailed' }

export function masteryBar(counts, small = false) {
  const total = counts.total || 1
  const segs = MASTERY_ORDER.map(m => {
    const n = counts[m]
    return n ? `<i class="seg-${m}" style="width:${(n / total) * 100}%" title="${MASTERY_LABEL[m]}: ${n}"></i>` : ''
  }).join('')
  const label = MASTERY_ORDER.map(m => `${counts[m]} ${MASTERY_LABEL[m].toLowerCase()}`).join(', ')
  return `<div class="mbar${small ? ' sm' : ''}" role="img" aria-label="${esc(label)}">${segs}</div>`
}

export function legend() {
  const colors = { nailed: 'var(--m-nailed)', familiar: 'var(--m-familiar)', learning: 'var(--m-learning)', new: 'var(--m-new)' }
  return `<div class="legend">${MASTERY_ORDER.map(m => `<span style="--c:${colors[m]}">${MASTERY_LABEL[m]}</span>`).join('')}</div>`
}

export function statusChip(status, struggling) {
  const chips = [`<span class="chip ${status}">${MASTERY_LABEL[status]}</span>`]
  if (struggling) chips.push('<span class="chip struggling">Struggling</span>')
  return chips.join(' ')
}

export const pct = x => `${Math.round(x * 100)}%`

export function domainName(deck, id) {
  return deck.domains.find(d => d.id === id)?.name ?? ''
}
export function taskName(deck, id) {
  return deck.tasks.find(t => t.id === id)?.name ?? ''
}

export function cardChips(deck, card) {
  const chips = [`<span class="chip">${KIND_LABEL[card.kind]}</span>`, `<span class="chip">D${card.domain} · ${esc(domainName(deck, card.domain))}</span>`]
  if (card.task) chips.push(`<span class="chip" title="${esc(taskName(deck, card.task))}">${card.task}</span>`)
  return `<div class="chips">${chips.join('')}</div>`
}

/** Query-string helpers for hash routes. */
export function qs(params) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function scopeLabel(deck, scope) {
  if (scope.task && scope.task !== 'none') return `${scope.task} ${taskName(deck, scope.task)}`
  if (scope.domain) return `Domain ${scope.domain}: ${domainName(deck, Number(scope.domain))}`
  if (scope.service) return deck.services.get(scope.service)?.name ?? scope.service
  if (scope.status === 'struggling') return 'Struggling cards'
  return 'All topics'
}
