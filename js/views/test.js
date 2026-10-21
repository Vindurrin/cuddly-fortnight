import { planTest } from '../session.js'
import { weakQuestions } from '../deck.js'
import { qs, scopeFromQuery, scopeLabel } from '../ui.js'
import { esc } from '../util.js'
import { runSession } from './runner.js'

export const title = () => 'Test'

const LENGTHS = [10, 20, 30, 50, 65]

export function render(ctx, route, root) {
  return route.parts[0] === 'run' ? run(ctx, route, root) : setup(ctx, root)
}

function run(ctx, route, root) {
  const { deck, store } = ctx
  const scope = scopeFromQuery(route.query)
  const count = Math.max(1, Math.min(200, Number(route.query.get('n')) || store.getSettings().testLength))
  const { cards } = planTest({ deck, getCard: ctx.getCard, settings: store.getSettings(), scope, now: ctx.now(), count, masteryOpts: ctx.levelOpts() })

  if (!cards.length) {
    root.innerHTML = `<div class="session"><section class="card done"><h2>No questions to ask</h2>
      <p class="muted">Nothing matches that selection right now.</p><a class="btn primary" href="#/test">Choose again</a></section></div>`
    return
  }
  return runSession(ctx, root, { mode: 'test', cards, exitHref: '#/test', label: `${cards.length}-question test · ${scopeLabel(deck, scope)}` })
}

function setup(ctx, root) {
  const { deck, store } = ctx
  const lo = ctx.levelOpts()
  const settings = store.getSettings()
  const weakCount = weakQuestions(deck, ctx.getCard, lo).length
  const state = { scope: '', n: LENGTHS.includes(settings.testLength) ? settings.testLength : settings.testLength }

  const scopeOptions = `<option value="">Everything (due questions first, then new)</option>
    ${weakCount ? `<option value="status:weak">My weak spots (${weakCount} questions)</option>` : ''}
    ${deck.domains.map(d => `<optgroup label="Domain ${d.id}: ${esc(d.name)}"><option value="domain:${d.id}">All of domain ${d.id}</option>
      ${deck.tasks.filter(t => t.domainId === d.id).map(t => `<option value="task:${t.id}">${t.id} ${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}`

  const lengths = [...new Set([...LENGTHS, state.n])].sort((a, b) => a - b)
  root.innerHTML = `
    <div class="session">
    <div class="pagehead"><h1>Take a test</h1><p>Questions only. Answer, read the explanation, move on.</p></div>
    <section class="card">
      <div class="field"><span class="label" id="len-l">How many questions?</span>
        <div class="opts-row" role="radiogroup" aria-labelledby="len-l">${lengths.map(n => `<label class="pill"><input type="radio" name="len" value="${n}" ${n === state.n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
      <div class="field"><label for="scope">What to ask about</label><select id="scope">${scopeOptions}</select></div>
      <p class="muted" id="avail" aria-live="polite"></p>
      <a class="btn primary lg block" id="go" href="#/test/run">Start test</a>
    </section>
    <p class="muted small">Every answer feeds your review schedule, so questions you miss come back sooner. Miss a few and you'll be pointed to the notecards for those topics.</p></div>`

  const $ = s => root.querySelector(s)
  function update() {
    const [k, v] = state.scope.split(':')
    const scope = k ? { [k]: v } : {}
    const { available, cards } = planTest({ deck, getCard: ctx.getCard, settings, scope, now: ctx.now(), count: state.n, masteryOpts: lo })
    $('#avail').textContent = available.total
      ? `${available.total} questions in this selection: ${available.due} due for review, ${available.unseen} not seen yet.${cards.length < state.n ? ` This test will have ${cards.length}.` : ''}`
      : 'No questions match this selection.'
    const go = $('#go')
    go.href = `#/test/run${qs({ ...scope, n: state.n })}`
    go.toggleAttribute('aria-disabled', !cards.length)
    go.style.opacity = cards.length ? '' : '.5'
    go.style.pointerEvents = cards.length ? '' : 'none'
  }
  $('#scope').addEventListener('change', e => { state.scope = e.target.value; update() })
  root.querySelectorAll('input[name="len"]').forEach(r => r.addEventListener('change', e => {
    state.n = Number(e.target.value)
    store.patchSettings({ testLength: state.n })
    update()
  }))
  update()
}
