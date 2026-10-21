import { createStore } from './store.js'
import { buildDeck } from './deck.js'
import { maxIntervalForExam, DEFAULTS } from './scheduler.js'
import { esc } from './util.js'
import * as home from './views/home.js'
import * as study from './views/study.js'
import * as test from './views/test.js'
import * as flash from './views/flash.js'
import * as cards from './views/cards.js'
import * as stats from './views/stats.js'
import * as settings from './views/settings.js'

const ROUTES = { '': home, test, flash, study, cards, stats, settings }
const root = document.getElementById('app')
let cleanup = null
let ctx = null

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  return { name: parts[0] ?? '', parts: parts.slice(1), query: new URLSearchParams(query) }
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}

function render() {
  if (!ctx) return
  cleanup?.()
  cleanup = null
  const route = parseHash()
  if (route.name === 'learn') { location.replace(`#/study/${route.parts.join('/')}`); return }
  const view = ROUTES[route.name] ?? home
  document.querySelectorAll('#nav a').forEach(a => {
    const active = route.name === 'flash' ? 'study' : route.name
    if (a.dataset.route === (ROUTES[active] ? active : '')) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
  document.title = `${view.title?.(ctx, route) ?? 'Home'} · CLF-C02 Study`
  try {
    cleanup = view.render(ctx, route, root) ?? null
  } catch (err) {
    console.error(err)
    root.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p><a class="btn" href="#/">Back to start</a></div>`
  }
  window.scrollTo(0, 0)
}

async function boot() {
  let questions, modules
  try {
    ;[questions, modules] = await Promise.all(['data/questions.json', 'data/modules.json'].map(u => fetch(u).then(r => {
      if (!r.ok) throw new Error(`${u}: ${r.status}`)
      return r.json()
    })))
  } catch (err) {
    root.innerHTML = `<div class="card"><h2>Could not load the card data</h2><p>${esc(err.message)}</p>
      <p class="muted">This app loads its data with <code>fetch</code>, so it must be served over HTTP rather than opened as a file. Run <code>npm run serve</code> (or <code>python3 -m http.server</code>) in this folder and open <code>http://localhost:8080</code>.</p></div>`
    return
  }

  const store = createStore(window.localStorage)
  const deck = buildDeck(questions, modules)
  const toastEl = document.getElementById('toast')
  let toastTimer

  ctx = {
    deck,
    store,
    now: () => Date.now(),
    getCard: id => store.getCard(id),
    get settings() { return store.getSettings() },
    /** Interval cap and mastery thresholds, tightened automatically when an exam date is set. */
    levelOpts() {
      const exam = store.getSettings().examDate
      const examTs = exam ? new Date(`${exam}T00:00:00`).getTime() : null
      const maxInterval = maxIntervalForExam(examTs, Date.now(), DEFAULTS.maxInterval)
      const nailedDays = Math.max(2, Math.min(DEFAULTS.nailedDays, maxInterval))
      const familiarDays = Math.max(1, Math.min(DEFAULTS.familiarDays, Math.ceil(nailedDays / 2)))
      return { maxInterval, nailedDays, familiarDays }
    },
    toast(msg) {
      toastEl.textContent = msg
      toastEl.classList.add('show')
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400)
    },
    applyTheme,
    refresh: render,
  }

  applyTheme(store.getSettings().theme)
  if (!store.persistent) {
    document.getElementById('banner').textContent =
      'Your browser is blocking storage, so progress will be lost when you close this tab. Export a backup from Settings, or allow site data.'
  }
  window.addEventListener('hashchange', render)
  render()
}

boot()
