import { filterCards, KIND_LABEL } from '../deck.js'
import { mastery, isStruggling, isDue } from '../scheduler.js'
import { statusChip, qs, domainName } from '../ui.js'
import { esc, fmtDuration } from '../util.js'
import { newCard } from '../scheduler.js'

export const title = () => 'Cards'

const PAGE = 50

export function render(ctx, route, root) {
  const { deck, store } = ctx
  const q = route.query
  const f = {
    domain: q.get('domain') || '', task: q.get('task') || '', kind: q.get('kind') || '',
    status: q.get('status') || '', service: q.get('service') || '', search: q.get('search') || '',
  }
  let shown = PAGE

  const opt = (v, label, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${esc(label)}</option>`
  root.innerHTML = `
    <h1>Cards</h1>
    <p class="muted">Browse everything in the deck and see where each card stands. Suspend a card to stop it from appearing in reviews.</p>
    <div class="card">
      <div class="filters" role="search">
        <select id="f-domain" aria-label="Domain">${opt('', 'All domains', f.domain)}${deck.domains.map(d => opt(d.id, `${d.id}. ${d.name}`, f.domain)).join('')}</select>
        <select id="f-task" aria-label="Task statement">${opt('', 'All topics', f.task)}${opt('none', 'Mixed (no topic)', f.task)}${deck.tasks.map(t => opt(t.id, `${t.id} ${t.name.slice(0, 40)}`, f.task)).join('')}</select>
        <select id="f-kind" aria-label="Card type">${opt('', 'All types', f.kind)}${Object.entries(KIND_LABEL).map(([k, v]) => opt(k, v + 's', f.kind)).join('')}</select>
        <select id="f-status" aria-label="Status">${opt('', 'Any status', f.status)}${['new', 'learning', 'familiar', 'nailed', 'struggling', 'due', 'suspended'].map(s => opt(s, s[0].toUpperCase() + s.slice(1), f.status)).join('')}</select>
        <input id="f-search" type="search" placeholder="Search cards…" value="${esc(f.search)}" aria-label="Search cards">
      </div>
      ${f.service ? `<p class="small">Filtered to service: <b>${esc(deck.services.get(f.service)?.name ?? f.service)}</b> <a href="#/cards">clear</a></p>` : ''}
      <p class="muted small" id="summary" aria-live="polite"></p>
      <div id="list"></div>
      <div class="actions" style="justify-content:center;margin-top:12px"><button class="btn" id="more" hidden>Show more</button></div>
    </div>`

  const list = root.querySelector('#list')
  const summary = root.querySelector('#summary')
  const more = root.querySelector('#more')
  let matches = []

  function dueLabel(st, now) {
    if (!st || st.s === 'new') return ''
    const diff = st.due - now
    return diff <= 0 ? 'due now' : `due in ${fmtDuration(diff)}`
  }

  function itemHtml(c, now, lo) {
    const st = ctx.getCard(c.id)
    const status = mastery(st, lo)
    const head = c.kind === 'mcq' ? c.question : c.kind === 'service' ? `Which service? ${c.front}` : c.front
    let body
    if (c.kind === 'mcq') {
      body = `<ul class="plain">${Object.entries(c.options).map(([k, v]) => `<li${c.answer.includes(k) ? ' class="ans"' : ''}>${k}. ${esc(v)}${c.answer.includes(k) ? ' ✓' : ''}</li>`).join('')}</ul>
        <p class="small">${c.explanation.map(esc).join('<br><br>')}</p>`
    } else if (c.kind === 'service') {
      body = `<p><b>${esc(c.name)}</b></p><p class="small">${esc(c.notes)}</p>${c.vs ? `<p class="small muted"><b>Don't confuse:</b> ${esc(c.vs)}</p>` : ''}`
    } else body = `<p class="small">${esc(c.back)}</p>`
    const stats = st && st.s !== 'new' ? `<p class="muted small">Reviewed ${st.reps}×, ${st.lapses} lapse${st.lapses === 1 ? '' : 's'}, interval ${st.ivl}d, ease ${st.ease.toFixed(2)}</p>` : ''
    return `<details class="item" data-id="${esc(c.id)}"><summary>
        <span class="q">${esc(head)}</span>
        <span class="meta">${st?.suspended ? '<span class="chip">Suspended</span>' : statusChip(status, isStruggling(st, lo))}<span class="muted small">${esc(dueLabel(st, now))}</span></span>
      </summary><div class="body">
        <div class="chips" style="margin-bottom:8px"><span class="chip">${KIND_LABEL[c.kind]}</span><span class="chip">D${c.domain}</span>${c.task ? `<span class="chip">${c.task}</span>` : ''}</div>
        ${body}${stats}
        <div class="actions">
          <button class="btn sm" data-act="suspend">${st?.suspended ? 'Resume card' : 'Suspend card'}</button>
          ${st && st.s !== 'new' ? '<button class="btn sm danger" data-act="reset">Reset progress</button>' : ''}
        </div></div></details>`
  }

  function update() {
    const now = ctx.now()
    const lo = ctx.levelOpts()
    matches = filterCards(deck, f, ctx.getCard, now, lo)
    summary.textContent = `${matches.length} card${matches.length === 1 ? '' : 's'}`
    list.innerHTML = matches.length ? matches.slice(0, shown).map(c => itemHtml(c, now, lo)).join('') : '<p class="empty">No cards match these filters.</p>'
    more.hidden = matches.length <= shown
  }

  function sync() {
    history.replaceState(null, '', `#/cards${qs(f)}`)
    shown = PAGE
    update()
  }

  const bind = (id, key) => root.querySelector(id).addEventListener('change', e => { f[key] = e.target.value; sync() })
  bind('#f-domain', 'domain'); bind('#f-task', 'task'); bind('#f-kind', 'kind'); bind('#f-status', 'status')
  let timer
  root.querySelector('#f-search').addEventListener('input', e => {
    clearTimeout(timer)
    timer = setTimeout(() => { f.search = e.target.value; sync() }, 200)
  })
  more.addEventListener('click', () => { shown += PAGE; update() })

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]')
    if (!btn) return
    const id = btn.closest('.item').dataset.id
    const st = ctx.getCard(id)
    if (btn.dataset.act === 'suspend') {
      const base = st ?? newCard(id)
      ctx.store.putCard({ ...base, suspended: !base.suspended })
      ctx.toast(base.suspended ? 'Card resumed' : 'Card suspended')
    } else if (btn.dataset.act === 'reset' && confirm('Reset this card back to new? Its review history for scheduling is lost.')) {
      ctx.store.deleteCard(id)
      ctx.toast('Card reset')
    } else return
    const open = new Set([...list.querySelectorAll('details[open]')].map(d => d.dataset.id))
    update()
    list.querySelectorAll('details').forEach(d => { if (open.has(d.dataset.id)) d.open = true })
  })

  update()
}
