export interface LogPatternRecord { id: string; message: string; timestampMs: number; severity?: string }
export interface LogPatternSegment { text: string; variable: boolean; values: string[] }
export interface LogPatternCluster { id: string; template: string; segments: LogPatternSegment[]; memberIds: string[]; count: number; percentage: number; severities: Record<string, number>; firstTimestampMs: number; lastTimestampMs: number; examples: LogPatternRecord[]; variables: Array<{ placeholder: string; values: string[] }> }

export const LOG_PATTERN_LIMITS = Object.freeze({
  maxMessageCharacters: 8192,
  maxTokens: 160,
  maxVariableSamples: 8,
  maxSemanticKeys: 10,
  maxCandidateClusters: 32,
  maxVariableRatio: .4,
  minStableTokens: 3
})

const timestamp = /^(?:\d{4}-\d\d-\d\d[T ][0-9:.+-]+Z?|\d\d:\d\d:\d\d(?:\.\d+)?)$/i
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/
const ipv6 = /^(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}(?::\d+)?$/i
const field = /^([a-z_][a-z0-9_.-]*=)(.+)$/i

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

interface Token {
  display: string
  normalized: string
  variable: boolean
  raw: string
  prefix: string
  suffix: string
  fieldKey?: string
  fieldValueRaw?: string
}

function stripMatchingQuotes(value: string): string {
  return value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) ? value.slice(1, -1) : value
}

function token(raw: string): Token {
  const match = raw.match(/^([^\p{L}\p{N}/\\]*)(.*?)([^\p{L}\p{N}/\\]*)$/u)
  const prefix = match?.[1] ?? '', core = match?.[2] ?? raw, suffix = match?.[3] ?? ''
  const fieldMatch = core.match(field)
  if (fieldMatch) {
    const fieldPrefix = fieldMatch[1]
    const fieldKey = fieldPrefix.slice(0, -1).toLowerCase()
    const fieldValueRaw = stripMatchingQuotes(fieldMatch[2])
    const placeholder = normalizedValue(fieldValueRaw)
    return {
      raw,
      prefix,
      suffix,
      fieldKey,
      fieldValueRaw,
      display: placeholder ? prefix + fieldPrefix + placeholder + suffix : raw,
      normalized: placeholder ? 'field:' + fieldKey + '=' + placeholder : core.toLowerCase(),
      variable: Boolean(placeholder)
    }
  }
  const placeholder = normalizedValue(core)
  return { raw, prefix, suffix, display: placeholder ? prefix + placeholder + suffix : raw, normalized: placeholder ?? core.toLowerCase(), variable: Boolean(placeholder) }
}

function tokenize(message: string): Token[] {
  const maxCharacters = LOG_PATTERN_LIMITS.maxMessageCharacters
  const source = message.length <= maxCharacters
    ? message
    : message.slice(0, Math.floor(maxCharacters * .75)) + ' ' + message.slice(-Math.floor(maxCharacters * .25))
  const words = source.match(/\S+/g) ?? []
  if (words.length <= LOG_PATTERN_LIMITS.maxTokens) return words.map(token)
  const headCount = Math.floor(LOG_PATTERN_LIMITS.maxTokens * .75)
  const tailCount = LOG_PATTERN_LIMITS.maxTokens - headCount
  return [...words.slice(0, headCount), ...words.slice(-tailCount)].map(token)
}

function hashText(text: string, seed = 2166136261): number {
  let hash = seed
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function tokenSequenceHash(tokens: Token[]): string {
  let hash = 2166136261
  for (const item of tokens) {
    hash = hashText(item.normalized, hash)
    hash ^= 255
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function hashId(text: string): string { return 'pattern-' + hashText(text).toString(36) }

function semanticKey(item: Token): string | null {
  if (item.fieldKey) return 'field:' + item.fieldKey
  if (item.variable) return null
  const normalized = item.normalized.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return normalized.length >= 2 ? 'token:' + normalized : null
}

function semanticKeys(tokens: Token[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of tokens) {
    const key = semanticKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(key)
    if (result.length >= LOG_PATTERN_LIMITS.maxSemanticKeys) break
  }
  return result
}

function compactSignatures(tokens: Token[]): string[] {
  const keys = semanticKeys(tokens)
  if (keys.length < 2) return keys.map((key) => 'single:' + hashText(key).toString(36))
  const signatures: string[] = []
  for (let left = 0; left < keys.length; left++) {
    for (let right = left + 1; right < keys.length; right++) {
      const first = hashText(keys[left]).toString(36), second = hashText(keys[right]).toString(36)
      signatures.push('pair:' + (first < second ? first + ':' + second : second + ':' + first))
    }
  }
  return signatures
}

interface Working {
  tokens: Token[]
  memberIds: string[]
  count: number
  firstTimestampMs: number
  lastTimestampMs: number
  severities: Record<string, number>
  examples: LogPatternRecord[]
  values: Map<number, string[]>
}

interface Match {
  differences: number[]
  score: number
}

const typedPlaceholder = (item: Token) => item.variable && item.normalized !== '<value>' && !item.normalized.endsWith('=<value>')
const broadVariable = (item: Token) => item.normalized === '<value>' || item.normalized.endsWith('=<value>')

function sameField(template: Token, item: Token): boolean {
  return Boolean(template.fieldKey && item.fieldKey && template.fieldKey === item.fieldKey)
}

function compatibleVariable(template: Token, item: Token): boolean {
  if (!template.variable) return false
  if (template.fieldKey) {
    if (!sameField(template, item)) return false
    if (broadVariable(template)) return true
    return template.normalized === item.normalized
  }
  if (broadVariable(template)) return true
  return template.normalized === item.normalized
}

function matchingCandidate(candidate: Working, incoming: Token[]): Match | null {
  if (candidate.tokens.length !== incoming.length) return null
  const differences: number[] = []
  let stable = 0

  for (let index = 0; index < incoming.length; index++) {
    const template = candidate.tokens[index], item = incoming[index]
    if (template.normalized === item.normalized || compatibleVariable(template, item)) {
      if (!broadVariable(template)) stable += 1
      continue
    }
    if (typedPlaceholder(template) || typedPlaceholder(item)) return null
    if (sameField(template, item)) {
      differences.push(index)
      continue
    }
    if (index === 0) return null
    differences.push(index)
  }

  if (!differences.length) return { differences, score: stable + incoming.length }
  if (incoming.length < 6) return null
  const maxDifferences = Math.max(1, Math.floor(incoming.length * LOG_PATTERN_LIMITS.maxVariableRatio))
  if (differences.length > maxDifferences || stable < LOG_PATTERN_LIMITS.minStableTokens) return null

  const similarity = stable / incoming.length
  if (similarity < 1 - LOG_PATTERN_LIMITS.maxVariableRatio) return null
  return { differences, score: stable * 4 - differences.length }
}

function addIndex(index: Map<string, number[]>, key: string, clusterIndex: number): void {
  const bucket = index.get(key)
  if (!bucket) { index.set(key, [clusterIndex]); return }
  if (!bucket.includes(clusterIndex)) bucket.push(clusterIndex)
}

function addSample(samples: string[], value: string): void {
  if (!value || samples.includes(value) || samples.length >= LOG_PATTERN_LIMITS.maxVariableSamples) return
  samples.push(value)
}

function sampleValue(item: Token): string { return item.fieldValueRaw ?? item.raw }

function generalize(template: Token, item: Token): void {
  if (sameField(template, item)) {
    template.display = template.prefix + (template.fieldKey ?? '') + '=<value>' + template.suffix
    template.normalized = 'field:' + template.fieldKey + '=<value>'
    template.variable = true
    return
  }
  template.display = template.prefix + '<value>' + template.suffix
  template.normalized = '<value>'
  template.variable = true
}

function addRecord(cluster: Working, record: LogPatternRecord, incoming: Token[]): void {
  cluster.memberIds.push(record.id)
  cluster.count += 1
  cluster.firstTimestampMs = Math.min(cluster.firstTimestampMs, record.timestampMs)
  cluster.lastTimestampMs = Math.max(cluster.lastTimestampMs, record.timestampMs)
  if (record.severity) cluster.severities[record.severity] = (cluster.severities[record.severity] ?? 0) + 1
  if (cluster.examples.length < 3) cluster.examples.push(record)
  incoming.forEach((item, index) => {
    if (!cluster.tokens[index].variable) return
    const samples = cluster.values.get(index) ?? []
    addSample(samples, sampleValue(item))
    cluster.values.set(index, samples)
  })
}

function createWorking(incoming: Token[]): Working {
  return {
    tokens: incoming.map((item) => ({ ...item })),
    memberIds: [],
    count: 0,
    firstTimestampMs: Number.POSITIVE_INFINITY,
    lastTimestampMs: Number.NEGATIVE_INFINITY,
    severities: {},
    examples: [],
    values: new Map()
  }
}

/**
 * Pure, bounded Drain-inspired template mining.
 *
 * Candidate discovery uses a constant number of compact, position-independent signatures
 * built from stable words and structured field names. Candidate verification then allows
 * several learned variable positions while keeping typed placeholders and the leading
 * semantic token conservative.
 */
export function clusterLogPatterns(records: LogPatternRecord[]): LogPatternCluster[] {
  const clusters: Working[] = []
  const exactIndex = new Map<string, number[]>()
  const signatureIndex = new Map<string, number[]>()

  for (const record of records) {
    const incoming = tokenize(record.message)
    const exactKey = incoming.length.toString(36) + ':' + tokenSequenceHash(incoming)
    const exactCandidates = exactIndex.get(exactKey) ?? []
    const votes = new Map<number, number>()

    for (const signature of compactSignatures(incoming)) {
      for (const candidateIndex of signatureIndex.get(signature) ?? []) {
        votes.set(candidateIndex, (votes.get(candidateIndex) ?? 0) + 1)
      }
    }

    const candidates = [...new Set([
      ...exactCandidates,
      ...[...votes.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, LOG_PATTERN_LIMITS.maxCandidateClusters)
        .map(([candidateIndex]) => candidateIndex)
    ])]

    let selected: number | undefined
    let selectedMatch: Match | null = null
    for (const candidateIndex of candidates) {
      const match = matchingCandidate(clusters[candidateIndex], incoming)
      if (!match || (selectedMatch && match.score <= selectedMatch.score)) continue
      selected = candidateIndex
      selectedMatch = match
    }

    if (selected === undefined || !selectedMatch) {
      selected = clusters.length
      clusters.push(createWorking(incoming))
      addIndex(exactIndex, exactKey, selected)
      for (const signature of compactSignatures(incoming)) addIndex(signatureIndex, signature, selected)
      selectedMatch = { differences: [], score: incoming.length }
    } else {
      addIndex(exactIndex, exactKey, selected)
    }

    const cluster = clusters[selected]
    for (const differingIndex of selectedMatch.differences) {
      const template = cluster.tokens[differingIndex], item = incoming[differingIndex]
      const samples = cluster.values.get(differingIndex) ?? []
      addSample(samples, sampleValue(template))
      addSample(samples, sampleValue(item))
      cluster.values.set(differingIndex, samples)
      generalize(template, item)
    }
    addRecord(cluster, record, incoming)
  }

  const total = records.length
  return clusters.map((cluster) => {
    const template = cluster.tokens.map(({ display }) => display).join(' ')
    const segments = cluster.tokens.map((item, index) => ({ text: item.display, variable: item.variable, values: [...(cluster.values.get(index) ?? [])] }))
    return {
      id: hashId(template),
      template,
      segments,
      memberIds: cluster.memberIds,
      count: cluster.count,
      percentage: total ? cluster.count / total * 100 : 0,
      severities: cluster.severities,
      firstTimestampMs: cluster.firstTimestampMs,
      lastTimestampMs: cluster.lastTimestampMs,
      examples: cluster.examples,
      variables: segments.filter(({ variable }) => variable).map(({ text, values }) => ({ placeholder: text, values }))
    }
  }).sort((left, right) => right.count - left.count || left.template.localeCompare(right.template))
}
