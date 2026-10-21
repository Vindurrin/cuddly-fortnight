// Progress persistence. Everything lives in the browser (localStorage); there is
// no server. Because browsers can clear site data, the store supports
// export/import of a single JSON backup file.

export const APP_ID = 'clf-c02-study'
const KEY_MAIN = `${APP_ID}:v1`
const KEY_LOG = `${APP_ID}:v1:log`
const LOG_LIMIT = 20000

export const DEFAULT_SETTINGS = {
  newPerDay: 20,
  examDate: null, // 'YYYY-MM-DD' or null
  mode: 'quiz', // 'quiz' (answer the question) | 'flip' (see answer, self-grade)
  shuffleOptions: true,
  newOrder: 'weighted', // 'weighted' by exam domain weight | 'ordered'
  theme: 'auto', // 'auto' | 'light' | 'dark'
}

function memoryStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: k => void m.delete(k),
  }
}

function probe(storage) {
  try {
    storage.setItem(`${APP_ID}:probe`, '1')
    storage.removeItem(`${APP_ID}:probe`)
    return true
  } catch {
    return false
  }
}

function parse(text, fallback) {
  if (!text) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

const isCard = c =>
  c && typeof c.id === 'string' && ['new', 'learn', 'review', 'relearn'].includes(c.s) && Number.isFinite(c.due) && Number.isFinite(c.ivl)

export function createStore(storage) {
  let persistent = true
  if (!storage || !probe(storage)) {
    storage = memoryStorage()
    persistent = false
  }

  let cards = {}
  let settings = { ...DEFAULT_SETTINGS }
  let log = []
  let saveError = null

  function load() {
    const main = parse(storage.getItem(KEY_MAIN), null)
    if (main && typeof main === 'object') {
      for (const c of Object.values(main.cards ?? {})) if (isCard(c)) cards[c.id] = c
      settings = { ...DEFAULT_SETTINGS, ...(main.settings ?? {}) }
    }
    const l = parse(storage.getItem(KEY_LOG), [])
    log = Array.isArray(l) ? l : []
  }

  function save(which = 'main') {
    try {
      if (which === 'main' || which === 'all') storage.setItem(KEY_MAIN, JSON.stringify({ cards, settings }))
      if (which === 'log' || which === 'all') storage.setItem(KEY_LOG, JSON.stringify(log))
      saveError = null
    } catch (e) {
      saveError = e
    }
  }

  load()

  return {
    get persistent() {
      return persistent && !saveError
    },
    getCard: id => cards[id],
    allCards: () => cards,
    putCard(card) {
      cards[card.id] = card
      save('main')
    },
    deleteCard(id) {
      delete cards[id]
      save('main')
    },
    addLog(entry) {
      log.push(entry)
      if (log.length > LOG_LIMIT) log = log.slice(-LOG_LIMIT)
      save('log')
    },
    getLog: () => log,
    popLog() {
      const e = log.pop()
      save('log')
      return e
    },
    getSettings: () => settings,
    patchSettings(patch) {
      settings = { ...settings, ...patch }
      save('main')
    },

    exportData() {
      return { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), settings, cards: Object.values(cards), log }
    },

    /** mode 'replace' discards current progress; 'merge' keeps the most recently reviewed copy of each card. */
    importData(data, mode = 'replace') {
      if (!data || data.app !== APP_ID || !Array.isArray(data.cards)) throw new Error('This is not a backup file from this app.')
      const incoming = data.cards.filter(isCard)
      if (mode === 'replace') {
        cards = {}
        log = []
      }
      for (const c of incoming) {
        const mine = cards[c.id]
        if (!mine || (c.last ?? 0) >= (mine.last ?? 0)) cards[c.id] = c
      }
      if (Array.isArray(data.log)) {
        const seen = new Set(log.map(e => `${e[0]}:${e[1]}`))
        for (const e of data.log) if (Array.isArray(e) && !seen.has(`${e[0]}:${e[1]}`)) log.push(e)
        log.sort((a, b) => a[0] - b[0])
        if (log.length > LOG_LIMIT) log = log.slice(-LOG_LIMIT)
      }
      if (mode === 'replace' && data.settings) settings = { ...DEFAULT_SETTINGS, ...data.settings }
      save('all')
      return { cards: incoming.length }
    },

    reset() {
      cards = {}
      log = []
      settings = { ...DEFAULT_SETTINGS }
      save('all')
    },
  }
}
