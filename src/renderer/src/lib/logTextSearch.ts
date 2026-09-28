/** Literal, case-insensitive loaded-log search. Whitespace is significant. */
export function createLogTextSearch(search: string) {
  const term = search.toLowerCase()
  const matches = (text: string) => text.toLowerCase().includes(term)
  const segments = (text: string): { text: string; matched: boolean }[] => {
    const normalized = text.toLowerCase()
    if (!term || !normalized.includes(term)) return [{ text, matched: false }]

    // Lowercasing can expand characters (e.g. İ). Map normalized offsets back
    // to the original text so highlighting never changes or drops characters.
    const offsets: { start: number; end: number }[] = []
    if (normalized.length !== text.length) {
      let start = 0
      for (const character of text) {
        const end = start + character.length
        for (let i = 0; i < character.toLowerCase().length; i++) offsets.push({ start, end })
        start = end
      }
    }
    const result: { text: string; matched: boolean }[] = []
    let cursor = 0
    let index = normalized.indexOf(term)
    while (index !== -1) {
      const start = offsets[index]?.start ?? index
      const end = offsets[index + term.length - 1]?.end ?? index + term.length
      if (start > cursor) result.push({ text: text.slice(cursor, start), matched: false })
      if (end > cursor) result.push({ text: text.slice(Math.max(cursor, start), end), matched: true })
      cursor = end
      index = normalized.indexOf(term, index + term.length)
    }
    if (cursor < text.length) result.push({ text: text.slice(cursor), matched: false })
    return result
  }
  return { matches, segments }
}
