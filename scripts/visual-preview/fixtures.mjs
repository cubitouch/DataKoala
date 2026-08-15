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
  { id: 'preview-postgres', name: 'Market analytics', kind: 'postgres', version: 1, readonly: true, config: { kind: 'postgres', host: 'localhost', port: 5432, database: 'analytics', user: 'demo', password: '' } },
  { id: 'docs-bigquery', name: 'Regional warehouse', kind: 'bigquery', version: 1, readonly: true, config: { kind: 'bigquery', projectId: 'sample-analytics' } },
  { id: 'docs-sqlite', name: 'Campaign archive', kind: 'sqlite', version: 1, readonly: true, config: { kind: 'sqlite', path: '/samples/campaigns.sqlite' } },
  { id: 'docs-files', name: 'Monthly exports', kind: 'files', version: 1, readonly: true, config: { kind: 'files', files: [] } },
  { id: 'docs-prometheus', name: 'Service metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'sample-metrics' } }
]
