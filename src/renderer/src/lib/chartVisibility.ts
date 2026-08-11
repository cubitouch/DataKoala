export type SeriesVisibility = Readonly<Record<string, boolean>>
export function reconcileSeriesVisibility(previous: SeriesVisibility, identities: readonly string[]): Record<string, boolean> {
  const next = Object.fromEntries(identities.map((id) => [id, previous[id] !== false]))
  const normalized = identities.length && !Object.values(next).some(Boolean) ? Object.fromEntries(identities.map((id) => [id, true])) : next
  const previousKeys = Object.keys(previous)
  return previousKeys.length === identities.length && identities.every((id) => previous[id] === normalized[id]) ? previous as Record<string, boolean> : normalized
}
export function toggleSeries(visibility: SeriesVisibility, identity: string): Record<string, boolean> {
  return { ...visibility, [identity]: visibility[identity] === false }
}
export function isolateSeries(visibility: SeriesVisibility, identities: readonly string[], identity: string): Record<string, boolean> {
  const isolated = identities.every((id) => (id === identity) === (visibility[id] !== false))
  return Object.fromEntries(identities.map((id) => [id, isolated || id === identity]))
}
export function showAllSeries(identities: readonly string[]): Record<string, boolean> { return Object.fromEntries(identities.map((id) => [id, true])) }
