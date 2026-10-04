import type { LogPatternCluster } from './log-patterns.ts'

const usefulLiteral = /[\p{L}\p{N}]/u

export function derivePatternLineContainsCandidate(
  cluster: Pick<LogPatternCluster, 'segments' | 'memberIds'>,
  messagesById: ReadonlyMap<string, string>,
): string | null {
  if (!cluster.memberIds.length) return null

  const candidates = new Set<string>()
  let run: string[] = []

  const addRunCandidates = () => {
    for (let start = 0; start < run.length; start += 1) {
      for (let end = run.length; end > start; end -= 1) {
        const candidate = run.slice(start, end).join(' ').trim()
        if (candidate && usefulLiteral.test(candidate))
          candidates.add(candidate)
      }
    }
    run = []
  }

  for (const segment of cluster.segments) {
    if (segment.variable) {
      addRunCandidates()
      continue
    }
    run.push(segment.text)
  }
  addRunCandidates()

  const ordered = [...candidates].sort(
    (left, right) => right.length - left.length || left.localeCompare(right),
  )

  for (const candidate of ordered) {
    const presentInEveryMember = cluster.memberIds.every((id) => {
      const message = messagesById.get(id)
      return message !== undefined && message.includes(candidate)
    })
    if (presentInEveryMember) return candidate
  }

  return null
}
