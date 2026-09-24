export interface LogPatternRecord { id: string; message: string; timestampMs: number; severity?: string }
export interface LogPatternSegment { text: string; variable: boolean; values?: string[] }
export interface LogPatternCluster { id: string; template: string; segments: LogPatternSegment[]; memberIds: string[]; count: number; percentage: number; severities: Record<string, number>; firstTimestampMs: number; lastTimestampMs: number; examples: LogPatternRecord[]; variables: Array<{ placeholder: string; values: string[] }> }
const timestamp = /^(?:\d{4}-\d\d-\d\d[T ][0-9:.+-]+Z?|\d\d:\d\d:\d\d(?:\.\d+)?)$/i
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/
const ipv6 = /^(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}(?::\d+)?$/i
function normalizedValue(value: string): string | null {
  if (timestamp.test(value)) return '<timestamp>'
  if (uuid.test(value)) return '<uuid>'
  if (ipv4.test(value) || ipv6.test(value)) return '<ip>'
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return '<url>'
  if (/^(?:\.?\.?\/|\/|[a-z]:\\)[^\s]+/i.test(value)) return '<path>'
  if (/^\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d)$/i.test(value)) return '<duration>'
  if (/^\d+(?:\.\d+)?(?:b|kb|mb|gb|tb|kib|mib|gib|tib)$/i.test(value)) return '<size>'
  if (/^(?:[0-9a-f]{12,}|sha(?:1|256|512):[0-9a-f]+)$/i.test(value)) return '<hash>'
  if (/^[+-]?(?:\d+(?:\.\d+)?|0x[0-9a-f]+)$/i.test(value)) return '<number>'
  if (/^(?=.*[a-z])(?=.*\d)[a-z0-9_.:-]{4,}$/i.test(value)) return '<value>'
  return null
}
interface Token { display: string; normalized: string; variable: boolean; raw: string }
function tokenize(message: string): Token[] { return (message.match(/\S+/g) ?? []).map((raw) => { const match = raw.match(/^([^\p{L}\p{N}/\\]*)(.*?)([^\p{L}\p{N}/\\]*)$/u); const prefix = match?.[1] ?? '', core = match?.[2] ?? raw, suffix = match?.[3] ?? ''; const placeholder = normalizedValue(core); return { raw, display: placeholder ? `${prefix}${placeholder}${suffix}` : raw, normalized: placeholder ?? core.toLowerCase(), variable: Boolean(placeholder) } }) }
function hashId(text: string): string { let hash = 2166136261; for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) } return `pattern-${(hash >>> 0).toString(36)}` }
interface Working { tokens: Token[]; records: LogPatternRecord[]; values: Map<number, Set<string>> }
/** Pure, bounded, Drain-inspired template mining, bucketed by length and leading anchors. */
export function clusterLogPatterns(records: LogPatternRecord[]): LogPatternCluster[] {
  const buckets = new Map<string, Working[]>()
  for (const record of records) {
    const incoming = tokenize(record.message), anchors = incoming.filter((token) => !token.variable).slice(0, 2).map((token) => token.normalized).join('|'), key = `${incoming.length}:${anchors}`, candidates = buckets.get(key) ?? []
    let match: Working | undefined
    for (const candidate of candidates.slice(0, 32)) { let equal = 0, unsafe = false; for (let i = 0; i < incoming.length; i++) { const left = candidate.tokens[i], right = incoming[i]; if (left.normalized === right.normalized || left.variable || right.variable) equal++; else if (i < 2 || incoming.length < 4) unsafe = true } if (!unsafe && equal / Math.max(1, incoming.length) >= .75) { match = candidate; break } }
    if (!match) { match = { tokens: incoming.map((token) => ({ ...token })), records: [], values: new Map() }; candidates.push(match); buckets.set(key, candidates) }
    match.records.push(record)
    incoming.forEach((token, i) => { const template = match!.tokens[i]; if (template.normalized !== token.normalized && !template.variable) Object.assign(template, { display: '<value>', normalized: '<value>', variable: true }); if (template.variable) { const values = match!.values.get(i) ?? new Set<string>(); values.add(token.raw); match!.values.set(i, values) } })
  }
  const total = records.length
  return [...buckets.values()].flat().map((cluster) => { const template = cluster.tokens.map((token) => token.display).join(' '), severities: Record<string, number> = {}; for (const record of cluster.records) if (record.severity) severities[record.severity] = (severities[record.severity] ?? 0) + 1; const segments = cluster.tokens.map((token, i) => ({ text: token.display, variable: token.variable, values: [...(cluster.values.get(i) ?? [])].slice(0, 8) })); return { id: hashId(template), template, segments, memberIds: cluster.records.map(({ id }) => id), count: cluster.records.length, percentage: total ? cluster.records.length / total * 100 : 0, severities, firstTimestampMs: Math.min(...cluster.records.map(({ timestampMs }) => timestampMs)), lastTimestampMs: Math.max(...cluster.records.map(({ timestampMs }) => timestampMs)), examples: cluster.records.slice(0, 3), variables: segments.filter(({ variable }) => variable).map(({ text, values }) => ({ placeholder: text, values })) } }).sort((a, b) => b.count - a.count || a.template.localeCompare(b.template))
}
