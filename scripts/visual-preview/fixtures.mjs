/** Public, deterministic artifacts produced by the real-renderer capture harness. */
export const documentationScreenshots = [
  'docs-overview.png',
  'docs-sql.png',
  'docs-builder.png',
  'docs-prometheus.png',
  'docs-visualization.png',
  'docs-data-sources.png'
]

export const syntheticSources = [
  { id: 'preview-postgres', name: 'Market analytics', kind: 'postgres', version: 1, host: 'localhost', port: 5432, database: 'analytics', user: 'demo', password: '', ssl: false, readonly: true },
  { id: 'docs-bigquery', name: 'Regional warehouse', kind: 'bigquery', version: 1, billingProject: 'sample-billing', defaultProject: 'sample-analytics', defaultDataset: 'analytics', maximumBytesBilled: '1000000000', readonly: true },
  { id: 'docs-sqlite', name: 'Campaign archive', kind: 'sqlite-file', version: 1, path: '/samples/campaigns.sqlite', readonly: true },
  { id: 'docs-files', name: 'Monthly exports', kind: 'local-files', version: 1, files: [{ path: '/samples/market_activity.csv', alias: 'market_activity' }], readonly: true },
  { id: 'docs-prometheus', name: 'Service metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'sample-metrics' } }
]
