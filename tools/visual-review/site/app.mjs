import {
  CHOICES, STORAGE_KEY, normalizeDecisions, readSaved, setDecision,
  exportPayload, importPayload, exportMarkdown,
} from './decisions.mjs'

const $ = id => document.getElementById(id)
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
let board
let decisions = {}
let selected
let storageReady = true

function summary() {
  const count = board.comparisons.filter(row => CHOICES.includes(decisions[row.id]?.choice)).length
  $('progress').textContent = count + ' / ' + board.comparisons.length + ' decided'
  $('source-info').textContent = board.counts.uniqueImages + ' real, SHA-verified PNGs · ' + board.counts.missingSlots + ' explicitly missing slots · PR #' + board.baseline.sourcePr
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, decisions }))
    $('save-status').textContent = 'Saved in this browser · export to share'
    storageReady = true
  } catch {
    storageReady = false
    $('save-status').textContent = 'Browser storage unavailable — export decisions before leaving'
  }
}
function options(id, items) {
  $(id).insertAdjacentHTML('beforeend', [...new Set(items)].sort().map(value => '<option value="' + escape(value) + '">' + escape(value) + '</option>').join(''))
}
function matches(row) {
  const search = $('search').value.trim().toLowerCase()
  const haystack = [row.title, row.id, row.atlasId, row.question, ...row.providers, ...row.sourceCandidates].join(' ').toLowerCase()
  if (search && !haystack.includes(search)) return false
  if ($('provider').value && !row.providers.includes($('provider').value)) return false
  if ($('category').value && row.category !== $('category').value) return false
  if ($('priority').value && row.priority !== $('priority').value) return false
  const decided = CHOICES.includes(decisions[row.id]?.choice)
  if ($('decision-filter').value === 'decided' && !decided) return false
  if ($('decision-filter').value === 'unreviewed' && decided) return false
  if ($('gaps-only').checked && !row.evidenceGap) return false
  return true
}
function renderQueue() {
  const filtered = board.comparisons.filter(matches)
  $('queue').innerHTML = filtered.length ? filtered.map(row => {
    const chosen = decisions[row.id]?.choice
    return '<button type="button" class="queue-item ' + (row.id === selected ? 'active' : '') +
      '" data-review="' + escape(row.id) + '" role="option" aria-selected="' + (row.id === selected) + '">' +
      '<span class="queue-top"><strong>' + escape(row.id) + '</strong><small>' + escape(row.priority) + '</small></span>' +
      '<span class="queue-title">' + escape(row.title) + '</span>' +
      '<span class="queue-bottom">' + escape(row.providers.join(' / ')) + '<span class="' + (chosen ? 'completed' : 'pending') + '">' + (chosen ? '✓ Decided' : '○ Review') + '</span></span></button>'
  }).join('') : '<p class="empty-queue">No comparisons match these filters.</p>'
  $('queue').querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', () => selectReview(button.dataset.review)))
}
function imageTile(row, image, index) {
  if (image.state === 'missing') {
    return '<div class="evidence-card missing-card"><div class="image-meta">FRAME ' + (index + 1) + ' <span>Missing evidence</span></div>' +
      '<div class="missing-content"><span class="missing-glyph">∅</span><h3>Not available</h3><p>' + escape(image.reason) + '</p></div></div>'
  }
  const viewport = image.viewport.join(' × ')
  const title = image.name + ' (' + image.width + ' × ' + image.height + ')'
  return '<article class="evidence-card"><div class="image-meta">FRAME ' + (index + 1) + '<span>Real · published capture</span></div>' +
    '<button class="image-hit" type="button" data-zoom="' + escape(image.name) + '" aria-label="Zoom ' + escape(title) + '">' +
    '<img loading="lazy" src="' + escape(image.url) + '" alt="' + escape(row.title + ': ' + image.scenario) + '"><span class="image-action">Zoom to original resolution ↗</span></button>' +
    '<div class="evidence-caption"><strong>' + escape(image.scenario) + '</strong><span>' + escape(image.width + ' × ' + image.height) + ' px' + (image.isComparisonSheet ? ' · harness-composed sheet' : '') + '</span></div>' +
    '<details class="provenance"><summary>Screenshot provenance</summary>' +
    '<dl><dt>Source HEAD</dt><dd><code>' + escape(image.sourceHead) + '</code></dd>' +
    '<dt>Scenario</dt><dd>' + escape(image.scenario) + '</dd>' +
    '<dt>Capture viewport</dt><dd>' + escape(viewport) + ' · compare with actual PNG dimensions above</dd>' +
    '<dt>Capture kind</dt><dd>' + escape(image.captureKind) + '</dd>' +
    '<dt>Artifact</dt><dd>' + escape(image.artifactName) + ' · ID ' + image.artifactId + ' · run ' + image.workflowRun + '</dd>' +
    '<dt>Published file</dt><dd><code>' + escape(image.publishedPath) + '</code></dd>' +
    '<dt>Git blob SHA</dt><dd><code>' + escape(image.blobSha) + '</code></dd></dl>' +
    '<a target="_blank" rel="noopener" href="' + escape('https://github.com/cubitouch/DataKoala/actions/runs/' + image.workflowRun) + '">GitHub Actions capture run ↗</a>' +
    '</details></article>'
}
function renderReview() {
  const row = board.comparisons.find(entry => entry.id === selected)
  if (!row) return
  const current = decisions[selected] ?? { choice: '', notes: '' }
  $('review-content').innerHTML = '<div class="review-top">' +
    '<p class="eyebrow">' + escape(row.id) + ' · ' + escape(row.atlasId) + ' · ' + escape(row.category) + '</p>' +
    '<h2>' + escape(row.title) + '</h2>' +
    '<div class="tags"><span class="tag priority-' + escape(row.priority.toLowerCase()) + '">' + escape(row.priority) + '</span>' +
    '<span class="tag">' + escape(row.status.replaceAll('_', ' ')) + '</span>' +
    row.providers.map(provider => '<span class="tag">' + escape(provider) + '</span>').join('') + '</div></div>' +
    '<section class="question"><span class="eyebrow">Decision to make</span><h3>' + escape(row.question) + '</h3><p>' + escape(row.rationale) + '</p>' +
    '<div class="source-links"><a target="_blank" rel="noopener" href="' + escape(row.atlasUrl) + '">View ' + escape(row.atlasId) + ' in reconciled Atlas ↗</a>' +
    row.sourceCitations.slice(0, 3).map(s => '<a href="' + escape(s.url) + '" target="_blank" rel="noopener">' + escape(s.batch) + ' source ↗</a>').join('') + '</div></section>' +
    '<div class="gallery-label"><h3>Evidence comparison</h3><span>Click an image to inspect at natural resolution</span></div>' +
    '<section class="gallery">' + row.images.map((image, index) => imageTile(row, image, index)).join('') + '</section>' +
    '<div class="evidence-note"><strong>Evidence boundary</strong><p>' + escape(row.evidenceGap) + '</p>' +
    '<p>Published captures are frozen copies from PR #442, not fresh VIS-01 recaptures. The image integrity check proves file identity, not that a pixel proves an interaction contract.</p></div>' +
    '<section class="decision-panel"><div class="decision-heading"><div><span class="eyebrow">Review decision</span><h3>Your disposition</h3></div><span class="autosave">Local autosave</span></div>' +
    '<fieldset><legend>Choose one outcome</legend><div class="decision-options">' +
    CHOICES.map((choice, index) => '<label class="decision-option"><input type="radio" name="review-decision" value="' + escape(choice) + '" ' + (current.choice === choice ? 'checked' : '') + '><span><b>' + escape(choice) + '</b><small>' + escape(['Use a shared design or mechanic', 'Keep provider-specific behavior deliberately', 'Request a different design direction', 'Evidence or product policy not yet sufficient'][index]) + '</small></span></label>').join('') +
    '</div></fieldset><label class="notes-label" for="notes">Review notes / acceptance conditions</label><textarea id="notes" rows="4" maxlength="10000" placeholder="Why? What should remain provider-specific? What additional evidence is required?">' + escape(current.notes) + '</textarea>' +
    '<div class="decision-bottom"><span>Linked Phase 2 package(s): ' + escape(row.workPackages.join(', ') || 'none') + '</span><button id="next" type="button">Next comparison →</button></div></section>'
  document.querySelectorAll('[name="review-decision"]').forEach(input => input.addEventListener('change', () => saveRow({ choice: input.value })))
  $('notes').addEventListener('input', input => saveRow({ notes: input.target.value }))
  $('next').addEventListener('click', () => {
    const index = board.comparisons.findIndex(item => item.id === selected)
    selectReview(board.comparisons[(index + 1) % board.comparisons.length].id)
  })
  document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
    const image = row.images.find(item => item.name === button.dataset.zoom)
    if (!image) return
    $('zoom-image').src = image.url
    $('zoom-image').alt = row.title + ': ' + image.scenario
    $('zoom-title').textContent = image.name + ' · ' + image.width + ' × ' + image.height + ' px'
    $('zoom-original').href = image.url
    $('zoom-dialog').showModal()
  }))
}
function saveRow(patch) {
  decisions = setDecision(decisions, selected, patch, board.comparisons.map(item => item.id))
  persist()
  summary()
  renderQueue()
}
function selectReview(id) {
  if (!board.comparisons.some(row => row.id === id)) return
  selected = id
  history.replaceState(null, '', '#' + encodeURIComponent(id))
  renderQueue()
  renderReview()
  document.querySelector('.review').scrollTop = 0
}
function download(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
function getExport() { return exportPayload(decisions, board.comparisons, board.baseline) }
async function initialize() {
  try {
    const response = await fetch('/data.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Cannot load generated comparison data')
    board = await response.json()
    const ids = board.comparisons.map(item => item.id)
    try { decisions = readSaved(localStorage.getItem(STORAGE_KEY), ids) } catch { storageReady = false }
    decisions = normalizeDecisions(decisions, ids)
    options('provider', board.comparisons.flatMap(item => item.providers))
    options('category', board.comparisons.map(item => item.category))
    options('priority', board.comparisons.map(item => item.priority))
    for (const name of ['search', 'provider', 'category', 'priority', 'decision-filter', 'gaps-only']) {
      $(name).addEventListener(name === 'search' ? 'input' : 'change', renderQueue)
    }
    $('export-json').addEventListener('click', () => download(JSON.stringify(getExport(), null, 2) + '\n', 'datakoala-vis01-decisions.json', 'application/json'))
    $('export-md').addEventListener('click', () => download(exportMarkdown(getExport()), 'datakoala-vis01-decisions.md', 'text/markdown'))
    $('import').addEventListener('change', async event => {
      const file = event.target.files?.[0]
      if (!file) return
      try {
        const imported = importPayload(await file.text(), board.comparisons)
        if (!confirm('Replace decisions currently stored in this browser with imported decisions?')) return
        decisions = imported
        persist()
        summary()
        renderQueue()
        renderReview()
      } catch (error) { alert('Import failed: ' + error.message) }
      finally { event.target.value = '' }
    })
    $('zoom-close').addEventListener('click', () => $('zoom-dialog').close())
    $('zoom-dialog').addEventListener('click', e => { if (e.target === $('zoom-dialog')) $('zoom-dialog').close() })
    summary()
    $('save-status').textContent = storageReady ? 'Changes will autosave in this browser' : 'Browser storage blocked — use export'
    const hashId = decodeURIComponent(location.hash.slice(1))
    selectReview(ids.includes(hashId) ? hashId : ids[0])
  } catch (error) {
    $('review-content').innerHTML = '<div class="error"><h2>Board could not start</h2><p>' + escape(error.message) + '</p><p>Run <code>node tools/visual-review/generate.mjs</code> and restart the local server.</p></div>'
  }
}
initialize()
