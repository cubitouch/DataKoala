export interface LogPatternRecord { id: string; message: string; timestampMs: number; severity?: string }
export interface LogPatternSegment { text: string; variable: boolean; values: string[] }
export interface LogPatternCluster { id: string; template: string; segments: LogPatternSegment[]; memberIds: string[]; count: number; percentage: number; severities: Record<string, number>; firstTimestampMs: number; lastTimestampMs: number; examples: LogPatternRecord[]; variables: Array<{ placeholder: string; values: string[] }> }

export const LOG_PATTERN_LIMITS = Object.freeze({
  maxMessageCharacters: 8192,
  maxTokens: 160,
  maxVariableSamples: 8,
  anchorCount: 4,
  minSignatureVotes: 2
})

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

function token(raw: string): Token {
  const match = raw.match(/^([^\p{L}\p{N}/\\]*)(.*?)([^\p{L}\p{N}/\\]*)$/u)
  const prefix = match?.[1] ?? '', core = match?.[2] ?? raw, suffix = match?.[3] ?? ''
  const placeholder = normalizedValue(core)
  return { raw, display: placeholder ? prefix + placeholder + suffix : raw, normalized: placeholder ?? core.toLowerCase(), variable: Boolean(placeholder) }
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

function anchorPositions(length: number): number[] {
  if (!length) return []
  const last = length - 1
  return [...new Set([0, Math.floor(last / 3), Math.floor(last * 2 / 3), last])].slice(0, LOG_PATTERN_LIMITS.anchorCount)
}

function compactSignatures(tokens: Token[]): string[] {
  const positions = anchorPositions(tokens.length)
  const signatures: string[] = []
  for (let left = 0; left < positions.length; left++) {
    for (let right = left + 1; right < positions.length; right++) {
      const leftIndex = positions[left], rightIndex = positions[right]
      signatures.push(
        tokens.length.toString(36) + ':' +
        leftIndex.toString(36) + ':' + hashText(tokens[leftIndex].normalized).toString(36) + ':' +
        rightIndex.toString(36) + ':' + hashText(tokens[rightIndex].normalized).toString(36)
      )
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

const typedPlaceholder = (item: Token) => item.variable && item.normalized !== '<value>'

function matchingDifference(candidate: Working, incoming: Token[]): number | null {
  if (candidate.tokens.length !== incoming.length) return null
  let differingIndex = -1
  for (let index = 0; index < incoming.length; index++) {
    const template = candidate.tokens[index], item = incoming[index]
    if (template.normalized === item.normalized || template.normalized === '<value>') continue
    if (typedPlaceholder(template) || typedPlaceholder(item) || differingIndex >= 0) return null
    differingIndex = index
  }
  if (differingIndex < 0) return -1
  return differingIndex > 0 && incoming.length >= 6 ? differingIndex : null
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
    addSample(samples, item.raw)
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
 * Candidate discovery uses a constant number of compact hashed anchor-pair signatures per
 * cluster instead of storing a near-complete message for every omitted token position.
 * Hash collisions are harmless because every candidate is verified token-by-token.
 */
export function clusterLogPatterns(records: LogPatternRecord[]): LogPatternCluster[] {
  const clusters: Working[] = []
  const exactIndex = new Map<string, number[]>()
  const signatureIndex = new Map<string, number[]>()

  for (const record of records) {
    const incoming = tokenize(record.message)
    const exactKey = incoming.length.toString(36) + ':' + tokenSequenceHash(incoming)
    const candidates = new Set<number>(exactIndex.get(exactKey) ?? [])
    const votes = new Map<number, number>()
    const signatures = compactSignatures(incoming)

    for (const signature of signatures) {
      for (const candidateIndex of signatureIndex.get(signature) ?? []) {
        votes.set(candidateIndex, (votes.get(candidateIndex) ?? 0) + 1)
      }
    }
    for (const [candidateIndex, voteCount] of [...votes.entries()].sort((left, right) => right[1] - left[1])) {
      if (voteCount >= LOG_PATTERN_LIMITS.minSignatureVotes) candidates.add(candidateIndex)
    }

    let selected: number | undefined
    let differingIndex = -1
    for (const candidateIndex of candidates) {
      const difference = matchingDifference(clusters[candidateIndex], incoming)
      if (difference === null) continue
      selected = candidateIndex
      differingIndex = difference
      break
    }

    if (selected === undefined) {
      selected = clusters.length
      clusters.push(createWorking(incoming))
      addIndex(exactIndex, exactKey, selected)
      for (const signature of signatures) addIndex(signatureIndex, signature, selected)
    } else {
      addIndex(exactIndex, exactKey, selected)
    }

    const cluster = clusters[selected]
    if (differingIndex >= 0) {
      const template = cluster.tokens[differingIndex]
      const samples = cluster.values.get(differingIndex) ?? []
      addSample(samples, template.raw)
      addSample(samples, incoming[differingIndex].raw)
      cluster.values.set(differingIndex, samples)
      Object.assign(template, { display: '<value>', normalized: '<value>', variable: true })
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
