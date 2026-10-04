import type { LogPatternCluster } from './log-patterns'

const useful = (value: string) =>
  value.length >= 3 && /[\p{L}\p{N}]/u.test(value)

function literalCandidates(cluster: Pick<LogPatternCluster, 'segments'>) {
  const runs: string[][] = []
  let current: string[] = []
  for (const segment of cluster.segments) {
    if (segment.variable) {
      if (current.length) runs.push(current)
      current = []
    } else {
      current.push(segment.text)
    }
  }
  if (current.length) runs.push(current)

  const candidates = new Set<string>()
  for (const run of runs) {
    for (let size = run.length; size > 0; size -= 1) {
      for (let start = 0; start + size <= run.length; start += 1) {
        const candidate = run.slice(start, start + size).join(' ').trim()
        if (useful(candidate)) candidates.add(candidate)
      }
    }
  }
  return [...candidates].sort(
    (left, right) => right.length - left.length || left.localeCompare(right),
  )
}

export function deriveLogPatternLineFilterCandidate(
  cluster: Pick<LogPatternCluster, 'segments'>,
  memberMessages: string[],
): string | null {
  if (!memberMessages.length) return null
  return (
    literalCandidates(cluster).find((candidate) =>
      memberMessages.every((message) => message.includes(candidate)),
    ) ?? null
  )
}
