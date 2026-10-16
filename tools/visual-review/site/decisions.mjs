export const CHOICES = [
  'Approve convergence',
  'Keep intentional difference',
  'Request redesign',
  'Defer',
]
export const STORAGE_KEY = 'datakoala.vis01.decisions.v1'
export const SCHEMA_VERSION = 1

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
export function normalizeDecisions(input, allowedIds) {
  const validIds = new Set(allowedIds)
  const normalized = {}
  if (!isObject(input)) return normalized
  for (const [id, row] of Object.entries(input)) {
    if (!validIds.has(id) || !isObject(row)) continue
    const choice = CHOICES.includes(row.choice) ? row.choice : ''
    const notes = typeof row.notes === 'string' ? row.notes.slice(0, 10000) : ''
    if (choice || notes) normalized[id] = { choice, notes }
  }
  return normalized
}
export function readSaved(raw, allowedIds) {
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.schemaVersion !== SCHEMA_VERSION) return {}
    return normalizeDecisions(parsed.decisions, allowedIds)
  } catch { return {} }
}
export function setDecision(current, id, patch, allowedIds) {
  if (!allowedIds.includes(id)) throw new Error('Unknown comparison ID')
  const row = current[id] ?? { choice: '', notes: '' }
  const next = { ...row, ...patch }
  if (next.choice && !CHOICES.includes(next.choice)) throw new Error('Unknown review decision')
  if (typeof next.notes !== 'string' || next.notes.length > 10000) throw new Error('Notes must be text under 10,000 characters')
  return { ...current, [id]: next }
}
export function exportPayload(decisions, comparisons, baseline, timestamp = new Date().toISOString()) {
  const safe = normalizeDecisions(decisions, comparisons.map(x => x.id))
  return { schemaVersion: SCHEMA_VERSION, kind: 'DataKoala VIS-01 decisions', exportedAt: timestamp, baseline, decisions: safe,
    review: comparisons.map(({ id, atlasId, title }) => ({ id, atlasId, title, ...safe[id] || { choice: '', notes: '' } })) }
}
export function importPayload(text, comparisons) {
  const value = JSON.parse(text)
  if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION || !isObject(value.decisions)) throw new Error('Not a VIS-01 decision export')
  return normalizeDecisions(value.decisions, comparisons.map(x => x.id))
}
export function exportMarkdown(payload) {
  const escape = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  const rows = payload.review.map(row => '| ' + [row.id, row.atlasId, row.title, row.choice || 'Unreviewed', row.notes].map(escape).join(' | ') + ' |')
  return '# DataKoala VIS-01 review decisions\n\nSource integration HEAD: \`' + payload.baseline.integrationHead +
    '\`\n\nExported: ' + payload.exportedAt + '\n\n| Review | Atlas | Question | Decision | Notes |\n| --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n'
}
