// Turns the raw data files into study cards, and answers questions about them
// (filters, mastery summaries, forecast).

import { mastery, isStruggling, isDue } from './scheduler.js'
import { addDays, startOfDay, DAY } from './util.js'

/** @returns {{cards: object[], byId: Map, domains: object[], tasks: object[], services: Map}} */
export function buildDeck(questions, modules) {
  const taskDomain = Object.fromEntries(modules.tasks.map(t => [t.id, t.domainId]))
  const cards = []

  for (const q of questions) {
    cards.push({ ...q, kind: 'mcq', task: q.task ?? null })
  }
  for (const s of modules.services) {
    cards.push({
      id: `svc:${s.id}`, kind: 'service', domain: taskDomain[s.task], task: s.task,
      serviceId: s.id, front: s.clue, name: s.name, notes: s.notes, vs: s.vs ?? null,
    })
  }
  for (const c of modules.concepts) {
    cards.push({ id: `con:${c.id}`, kind: 'concept', domain: taskDomain[c.task], task: c.task, front: c.front, back: c.back })
  }

  const byId = new Map(cards.map(c => [c.id, c]))
  const services = new Map(modules.services.map(s => [s.id, s]))
  return { cards, byId, domains: modules.domains, tasks: modules.tasks, services }
}

export const KIND_LABEL = { mcq: 'Question', service: 'Service', concept: 'Concept' }

/**
 * scope: { domain, task ('none' for untagged), service, kind, status, search }
 * status: new | learning | familiar | nailed | struggling | due | suspended
 */
export function filterCards(deck, scope, getCard, now, masteryOpts) {
  const search = scope.search?.trim().toLowerCase()
  return deck.cards.filter(c => {
    if (scope.domain && c.domain !== Number(scope.domain)) return false
    if (scope.task === 'none' ? c.task : scope.task && c.task !== scope.task) return false
    if (scope.kind && c.kind !== scope.kind) return false
    if (scope.service && !(c.serviceId === scope.service || c.services?.includes(scope.service))) return false
    const st = getCard(c.id)
    if (scope.status) {
      if (st?.suspended && scope.status !== 'suspended') return false
      const m = mastery(st, masteryOpts)
      switch (scope.status) {
        case 'struggling': if (!isStruggling(st, masteryOpts)) return false; break
        case 'due': if (!isDue(st, now) ) return false; break
        case 'suspended': if (!st?.suspended) return false; break
        default: if (m !== scope.status) return false
      }
    }
    if (search) {
      const hay = `${c.question ?? c.front} ${c.name ?? ''} ${c.back ?? ''} ${c.notes ?? ''} ${Object.values(c.options ?? {}).join(' ')}`.toLowerCase()
      if (!hay.includes(search)) return false
    }
    return true
  })
}

const SCORE = { new: 0, learning: 0.25, familiar: 0.6, nailed: 1 }

export function emptyCounts() {
  return { total: 0, new: 0, learning: 0, familiar: 0, nailed: 0, struggling: 0, due: 0, suspended: 0 }
}

export function tally(cards, getCard, now, masteryOpts) {
  const out = emptyCounts()
  for (const c of cards) {
    const st = getCard(c.id)
    if (st?.suspended) { out.suspended++; continue }
    out.total++
    out[mastery(st, masteryOpts)]++
    if (isStruggling(st, masteryOpts)) out.struggling++
    if (isDue(st, now)) out.due++
  }
  return out
}

/** 0..1 score: nailed counts fully, familiar partly, learning a little. */
export function masteryScore(counts) {
  if (!counts.total) return 0
  return (counts.nailed * SCORE.nailed + counts.familiar * SCORE.familiar + counts.learning * SCORE.learning) / counts.total
}

export function summarize(deck, getCard, now, masteryOpts) {
  const all = tally(deck.cards, getCard, now, masteryOpts)
  const byDomain = {}
  for (const d of deck.domains) byDomain[d.id] = tally(deck.cards.filter(c => c.domain === d.id), getCard, now, masteryOpts)
  const byTask = {}
  for (const t of deck.tasks) byTask[t.id] = tally(deck.cards.filter(c => c.task === t.id), getCard, now, masteryOpts)
  const untagged = {}
  for (const d of deck.domains) untagged[d.id] = tally(deck.cards.filter(c => c.domain === d.id && !c.task), getCard, now, masteryOpts)

  const examScore = deck.domains.reduce((sum, d) => sum + masteryScore(byDomain[d.id]) * d.weight, 0) / deck.domains.reduce((s, d) => s + d.weight, 0)
  return { all, byDomain, byTask, untagged, examScore }
}

/** Number of cards coming due on each of the next `days` days (index 0 = today, incl. overdue). */
export function forecast(deck, getCard, now, days = 7) {
  const out = new Array(days).fill(0)
  const today = startOfDay(now)
  for (const c of deck.cards) {
    const st = getCard(c.id)
    if (!st || st.s === 'new' || st.suspended) continue
    const idx = Math.max(0, Math.floor((startOfDay(st.due) - today) / DAY + 0.5))
    if (idx < days) out[idx]++
  }
  return out
}
