export const QUERY_LOADING_DELAY_MS = 140
export function shouldShowQueryLoading(running: boolean, elapsedMs: number): boolean {
  return running && elapsedMs >= QUERY_LOADING_DELAY_MS
}
