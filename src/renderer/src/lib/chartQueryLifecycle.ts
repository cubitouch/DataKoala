import type { ResultView } from './resultVisualization.ts'

/** Loading and error state never decide chart identity; only data and the selected view do. */
export function shouldKeepChartMounted(view: ResultView, hasSuccessfulResult: boolean): boolean {
  return view !== 'table' && hasSuccessfulResult
}

export function chartActionsReady(rendered: boolean, running: boolean, error: string | null): boolean {
  return rendered && !running && !error
}
