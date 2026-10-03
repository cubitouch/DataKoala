import { withQueryErrors } from '@lib/queryErrors'

const bridge = window.datakoala

// Keep transport errors out of every query consumer (builders, editors and charts).
export const api: typeof bridge = bridge && {
  ...bridge,
  query: {
    ...bridge.query,
    run: (...args) => withQueryErrors(() => bridge.query.run(...args)),
    runLoki: (...args) => withQueryErrors(() => bridge.query.runLoki(...args)),
    explain: (...args) => withQueryErrors(() => bridge.query.explain(...args)),
    probeSeriesCardinality: (...args) =>
      withQueryErrors(() => bridge.query.probeSeriesCardinality(...args)),
    seriesStatistics: (...args) =>
      withQueryErrors(() => bridge.query.seriesStatistics(...args)),
  },
}
