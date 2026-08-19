export const IPC = {
  CONNECTION_TEST: 'connection:test',
  CONNECTION_CONNECT: 'connection:connect',
  CONNECTION_DISCONNECT: 'connection:disconnect',
  CONNECTION_STATE_CHANGED: 'connection:state-changed',
  CONNECTION_LIST_OBJECTS: 'connection:list-objects',
  CONNECTION_DESCRIBE_TABLE: 'connection:describe-table',
  CONNECTION_CHOOSE_FILES: 'connection:choose-files',
  CONNECTION_CHOOSE_SQLITE_FILE: 'connection:choose-sqlite-file',
  BIGQUERY_DISCOVER_PROJECTS: 'connections:bigquery:discover-projects',
  BIGQUERY_LIST_DATASETS: 'connections:bigquery:list-datasets',
  BIGQUERY_DISCOVER_DEFAULTS: 'connections:bigquery:discover-defaults',
  PROMETHEUS_DISCOVER: 'connections:prometheus:discover',
  PROMETHEUS_DISCOVER_DATASOURCES: 'connections:prometheus:discover-datasources',
  PROMETHEUS_METRIC_LABELS: 'connections:prometheus:metric-labels',
  PROMETHEUS_LABEL_VALUES: 'connections:prometheus:label-values',
  PROMETHEUS_FORMAT_QUERY: 'connections:prometheus:format-query',
  QUERY_RUN: 'query:run',
  QUERY_PROGRESS: 'query:progress',
  QUERY_PROBE_SERIES_CARDINALITY: 'query:probe-series-cardinality',
  QUERY_SERIES_STATISTICS: 'query:series-statistics',
  QUERY_EXPLAIN: 'query:explain',
  CLIPBOARD_WRITE_PNG: 'clipboard:write-png'
} as const

export type IpcChannels = (typeof IPC)[keyof typeof IPC]
