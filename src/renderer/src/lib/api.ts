import { QueryExecutionError, withQueryErrors } from '@lib/queryErrors'
import type { QueryResult } from '@shared/types'

const bridge = window.datakoala
type Bridge = typeof bridge
type RendererApi = Omit<Bridge, 'query'> & {
  query: Omit<Bridge['query'], 'run'> & {
    run: (...args: Parameters<Bridge['query']['run']>) => Promise<QueryResult>
  }
}

// Keep transport errors out of every query consumer (builders, editors and charts).
export const api: RendererApi = bridge && {
  ...bridge,
  query: {
    ...bridge.query,
    run: (...args) =>
      withQueryErrors(async () => {
        const response = await bridge.query.run(...args)
        if (!response.ok)
          throw new QueryExecutionError(response.kind, response.message)
        return response.result
      }),
    runLoki: (...args) => withQueryErrors(() => bridge.query.runLoki(...args)),
    explain: (...args) => withQueryErrors(() => bridge.query.explain(...args)),
    probeSeriesCardinality: (...args) =>
      withQueryErrors(() => bridge.query.probeSeriesCardinality(...args)),
    seriesStatistics: (...args) =>
      withQueryErrors(() => bridge.query.seriesStatistics(...args)),
  },
}
