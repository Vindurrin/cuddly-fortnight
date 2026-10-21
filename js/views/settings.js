import { esc, dayKey } from '../util.js'
import { TIMER_MODES } from '../timer.js'

export const title = () => 'Settings'

export function render(ctx, route, root) {
  const { store } = ctx
  const s = store.getSettings()
  const lo = ctx.levelOpts()
  const opt = (v, label, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${label}</option>`

  root.innerHTML = `
    <h1>Settings</h1>
    <section class="card">
      <h2>Studying</h2>
      <div class="field"><label for="testLength">Questions per test</label>
        <input id="testLength" type="number" min="1" max="200" value="${s.testLength}" style="width:110px">
        <span class="help">The default length of a test. The real exam has 65 questions. You can also pick a length each time on the Test page.</span></div>
      <div class="field"><label for="testTimer">Test timer</label>
        <select id="testTimer">${Object.entries(TIMER_MODES).map(([k, v]) => opt(k, v, s.testTimer)).join('')}</select>
        <span class="help">Exam pace counts down at the real exam's rate (about 83 seconds a question).</span></div>
      <div class="field"><label for="newPerDay">New notecards per day</label>
        <input id="newPerDay" type="number" min="0" max="500" value="${s.newPerDay}" style="width:110px">
        <span class="help">How many unseen notecards to introduce each day. There are ${ctx.deck.cards.filter(c => c.kind !== 'mcq').length} in total.</span></div>
      <div class="field"><label for="examDate">Exam date</label>
        <div class="row"><input id="examDate" type="date" value="${esc(s.examDate ?? '')}"><button class="btn sm" id="clearExam" ${s.examDate ? '' : 'hidden'}>Clear</button></div>
        <span class="help">${s.examDate ? `Review gaps are capped at ${lo.maxInterval} day${lo.maxInterval === 1 ? '' : 's'} so every card is seen again before the exam, and "nailed" means scheduled ${lo.nailedDays}+ days out.` : 'Optional. With a date set, review gaps are capped so every card comes back before the exam.'}</span></div>
      <div class="field"><label for="newOrder">Order of new notecards</label>
        <select id="newOrder">${opt('weighted', 'Mixed, weighted by exam domain', s.newOrder)}${opt('ordered', 'In deck order', s.newOrder)}</select></div>
      <div class="switch"><input id="shuffle" type="checkbox" ${s.shuffleOptions ? 'checked' : ''}><label for="shuffle">Shuffle answer options</label></div>
    </section>

    <section class="card"><h2>Appearance</h2>
      <div class="field"><label for="theme">Theme</label>
        <select id="theme">${opt('auto', 'Match my device', s.theme)}${opt('light', 'Light', s.theme)}${opt('dark', 'Dark', s.theme)}</select></div>
    </section>

    <section class="card"><h2>Backup</h2>
      <p>Your progress is stored in this browser only. Clearing site data, or switching browser or device, starts you from scratch, so export a backup now and then.</p>
      <div class="actions"><button class="btn" id="export">Export progress</button></div>
      <div class="field" style="margin-top:16px"><label for="importFile">Restore from a backup</label>
        <div class="row"><select id="importMode" aria-label="Import mode">${opt('merge', 'Merge with current progress', 'merge')}${opt('replace', 'Replace current progress', 'merge')}</select>
        <input id="importFile" type="file" accept="application/json,.json"></div>
        <span class="help">Merging keeps the most recently reviewed copy of each card. Use it to combine progress from two devices.</span></div>
    </section>

    <section class="card"><h2>Reset</h2>
      <p class="muted">Erase all progress and settings from this browser.</p>
      <button class="btn danger" id="reset">Reset all progress</button></section>

    <section class="card"><h2>About</h2>
      <p class="small">Practice questions come from the open-source <a href="https://github.com/nastaso/cloudcertprep" target="_blank" rel="noopener">CloudCertPrep</a> question bank (MIT licence, © Alex Santonastaso). Task-statement and service tagging, the service and concept flashcards, and the scheduler are part of this project. See <code>NOTICE.md</code>.</p>
      <p class="small muted" style="margin:0">Unofficial study aid, not affiliated with or endorsed by AWS. Always check the current <a href="https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html" target="_blank" rel="noopener">exam guide</a>.</p></section>`

  const $ = id => root.querySelector(id)
  const save = patch => { store.patchSettings(patch); ctx.toast('Saved') }

  $('#newPerDay').addEventListener('change', e => {
    const n = Math.max(0, Math.min(500, Math.floor(Number(e.target.value) || 0)))
    e.target.value = n
    save({ newPerDay: n })
  })
  $('#examDate').addEventListener('change', e => { save({ examDate: e.target.value || null }); ctx.refresh() })
  $('#clearExam').addEventListener('click', () => { save({ examDate: null }); ctx.refresh() })
  $('#testLength').addEventListener('change', e => {
    const n = Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 30)))
    e.target.value = n
    save({ testLength: n })
  })
  $('#testTimer').addEventListener('change', e => save({ testTimer: e.target.value }))
  $('#newOrder').addEventListener('change', e => save({ newOrder: e.target.value }))
  $('#shuffle').addEventListener('change', e => save({ shuffleOptions: e.target.checked }))
  $('#theme').addEventListener('change', e => { save({ theme: e.target.value }); ctx.applyTheme(e.target.value) })

  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `clf-c02-progress-${dayKey(Date.now())}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })

  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    const mode = $('#importMode').value
    try {
      const data = JSON.parse(await file.text())
      if (mode === 'replace' && !confirm('Replace all current progress with this backup?')) return
      const { cards } = store.importData(data, mode)
      ctx.applyTheme(store.getSettings().theme)
      ctx.toast(`Imported ${cards} cards`)
      ctx.refresh()
    } catch (err) {
      ctx.toast(`Import failed: ${err.message}`)
    } finally {
      e.target.value = ''
    }
  })

  $('#reset').addEventListener('click', () => {
    if (confirm('Erase ALL progress and settings in this browser? This cannot be undone.') && confirm('Really erase everything?')) {
      store.reset()
      ctx.applyTheme('auto')
      ctx.toast('Progress erased')
      location.hash = '#/'
      ctx.refresh()
    }
  })
}
