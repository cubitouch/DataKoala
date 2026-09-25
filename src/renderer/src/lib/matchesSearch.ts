export const normalizeSearchText = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

export function matchesSearch(value: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return true

  const haystack = normalizeSearchText(value)
  return normalizedQuery.split(' ').every((token) => haystack.includes(token))
}
