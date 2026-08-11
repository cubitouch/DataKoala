// Run with Electron's embedded Node runtime so dependency engine regressions are
// caught without loading a window, resolving ADC, or making a network request.
import { BigQuery } from '@google-cloud/bigquery'

const client = new BigQuery({ projectId: 'datakoala-offline-smoke' })
if (!client || typeof client.createQueryJob !== 'function') {
  throw new Error('The BigQuery client could not be constructed in Electron.')
}
console.log(`BIGQUERY_CLIENT_SMOKE_OK node=${process.versions.node} electron=${process.versions.electron}`)
