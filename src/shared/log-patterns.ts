export interface LogPatternRecord { id: string; message: string; timestampMs: number; severity?: string }
export interface LogPatternSegment { text: string; variable: boolean; values: string[] }
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
function tokenize(message: string): Token[] {
  return (message.match(/\S+/g) ?? []).map((raw) => {
    const match = raw.match(/^([^\p{L}\p{N}/\\]*)(.*?)([^\p{L}\p{N}/\\]*)$/u)
    const prefix = match?.[1] ?? '', core = match?.[2] ?? raw, suffix = match?.[3] ?? ''
    const placeholder = normalizedValue(core)
    return { raw, display: placeholder ? `${prefix}${placeholder}${suffix}` : raw, normalized: placeholder ?? core.toLowerCase(), variable: Boolean(placeholder) }
  })
}
function hashId(text: string): string { let hash = 2166136261; for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) } return `pattern-${(hash >>> 0).toString(36)}` }
interface Working { tokens: Token[]; records: LogPatternRecord[]; values: Map<number, Set<string>> }
const typedPlaceholder = (token: Token) => token.variable && token.normalized !== '<value>'
const omissionKey = (tokens: Token[], omitted: number) => `${tokens.length}:${tokens.map((token, index) => index === omitted ? '*' : token.normalized).join('\u0001')}`

/** Pure Drain-inspired mining. Omission branches find one unknown textual variable without
 * scanning a bucket, while typed placeholders only match values of the same normalized type. */
export function clusterLogPatterns(records: LogPatternRecord[]): LogPatternCluster[] {
  const clusters: Working[] = [], exact = new Map<string, number>(), branches = new Map<string, Set<number>>()
  for (const record of records) {
    const incoming = tokenize(record.message)
    const exactKey = `${incoming.length}:${incoming.map(({ normalized }) => normalized).join('\u0001')}`
    const possible = new Set<number>()
    const direct = exact.get(exactKey); if (direct !== undefined) possible.add(direct)
    for (let index = 0; index < incoming.length; index++) for (const candidate of branches.get(omissionKey(incoming, index)) ?? []) possible.add(candidate)
    let selected: number | undefined, differingIndex = -1
    for (const candidateIndex of possible) {
      const candidate = clusters[candidateIndex]
      if (candidate.tokens.length !== incoming.length) continue
      const differences: number[] = []; let incompatible = false
      for (let index = 0; index < incoming.length; index++) {
        const template = candidate.tokens[index], token = incoming[index]
        if (template.normalized === token.normalized || template.normalized === '<value>') continue
        if (typedPlaceholder(template) || typedPlaceholder(token)) { incompatible = true; break }
        differences.push(index)
      }
      // Generalizing arbitrary prose is deliberately narrow: one non-leading textual value
      // in a sufficiently descriptive message. Short action/status messages remain distinct.
      if (!incompatible && differences.length <= 1 && (differences.length === 0 || (differences[0] > 0 && incoming.length >= 6))) { selected = candidateIndex; differingIndex = differences[0] ?? -1; break }
    }
    if (selected === undefined) {
      selected = clusters.length
      clusters.push({ tokens: incoming.map((token) => ({ ...token })), records: [], values: new Map() })
      exact.set(exactKey, selected)
      for (let index = 0; index < incoming.length; index++) { const key = omissionKey(incoming, index), set = branches.get(key) ?? new Set<number>(); set.add(selected); branches.set(key, set) }
    }
    const cluster = clusters[selected]
    if (differingIndex >= 0) {
      const template = cluster.tokens[differingIndex]
      const values = cluster.values.get(differingIndex) ?? new Set<string>()
      for (const previous of cluster.records) values.add(tokenize(previous.message)[differingIndex]?.raw ?? '')
      values.add(incoming[differingIndex].raw); cluster.values.set(differingIndex, values)
      Object.assign(template, { display: '<value>', normalized: '<value>', variable: true })
    }
    cluster.records.push(record)
    incoming.forEach((token, index) => { if (!cluster.tokens[index].variable) return; const values = cluster.values.get(index) ?? new Set<string>(); values.add(token.raw); cluster.values.set(index, values) })
  }
  const total = records.length
  return clusters.map((cluster) => {
    const template = cluster.tokens.map(({ display }) => display).join(' '), severities: Record<string, number> = {}
    for (const record of cluster.records) if (record.severity) severities[record.severity] = (severities[record.severity] ?? 0) + 1
    const segments = cluster.tokens.map((token, index) => ({ text: token.display, variable: token.variable, values: [...(cluster.values.get(index) ?? [])].filter(Boolean).slice(0, 8) }))
    return { id: hashId(template), template, segments, memberIds: cluster.records.map(({ id }) => id), count: cluster.records.length, percentage: total ? cluster.records.length / total * 100 : 0, severities, firstTimestampMs: Math.min(...cluster.records.map(({ timestampMs }) => timestampMs)), lastTimestampMs: Math.max(...cluster.records.map(({ timestampMs }) => timestampMs)), examples: cluster.records.slice(0, 3), variables: segments.filter(({ variable }) => variable).map(({ text, values }) => ({ placeholder: text, values })) }
  }).sort((a, b) => b.count - a.count || a.template.localeCompare(b.template))
}
