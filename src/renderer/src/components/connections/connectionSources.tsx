import type { DataSourceKind } from '@shared/types'

export type PickerKind = DataSourceKind | 'excel'

export interface ConnectionSourceDescriptor {
  kind: PickerKind
  label: string
  description: string
  hint: string
  icon: 'postgresql' | 'duckdb' | 'sqlite' | 'bigquery' | 'prometheus' | 'tempo' | 'loki' | 'excel'
  status: 'available' | 'coming-soon'
  supportsCreate: boolean
}

export const CONNECTION_SOURCE_DESCRIPTORS: readonly ConnectionSourceDescriptor[] = [
  { kind: 'postgres', label: 'PostgreSQL', description: 'Connect with host, port, database and credentials.', hint: 'Postgres database', icon: 'postgresql', status: 'available', supportsCreate: true },
  { kind: 'local-files', label: 'Local files', description: 'Query CSV, Parquet and JSON files through DuckDB.', hint: 'One or more files', icon: 'duckdb', status: 'available', supportsCreate: true },
  { kind: 'sqlite-file', label: 'SQLite', description: 'Open a SQLite database file through DuckDB.', hint: '.sqlite or .db file', icon: 'sqlite', status: 'available', supportsCreate: true },
  { kind: 'bigquery', label: 'BigQuery', description: 'Use Google ADC credentials to browse and query datasets.', hint: 'Cloud data warehouse', icon: 'bigquery', status: 'available', supportsCreate: true },
  { kind: 'prometheus', label: 'Prometheus', description: 'Discover Grafana Cloud metrics through your existing gcx login.', hint: 'Metrics via gcx', icon: 'prometheus', status: 'available', supportsCreate: true },
  { kind: 'tempo', label: 'Tempo', description: 'Search and inspect distributed traces through your existing gcx login.', hint: 'Traces via gcx', icon: 'tempo', status: 'available', supportsCreate: true },
  { kind: 'loki', label: 'Loki', description: 'Explore Grafana Loki logs through your existing gcx login.', hint: 'Logs via gcx', icon: 'loki', status: 'available', supportsCreate: true },
  { kind: 'excel', label: 'Excel', description: 'Explore workbook sheets as tables.', hint: 'Coming soon', icon: 'excel', status: 'coming-soon', supportsCreate: false }
]

export function SourceIcon({ type }: { type: ConnectionSourceDescriptor['icon'] }) {
  const common = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (type === 'postgresql') return <svg {...common}><path d="M7.2 14.7C4.7 13.6 4 10.5 4.7 7.5 5.4 4.6 8 3.1 11 4.2c2.8-1.5 6-.2 7 2.7.8 2.3.3 5.6-1.7 7.1"/><path d="M9.2 8.2c.2 3.6.8 6.5 2 8.6.8 1.7 2.8 2.6 4.3 1.5.8-.6.6-1.6-.2-2.1-1.1-.6-2.7-.1-3.5.6M14.8 8.2c-.2 3.6-.8 6.5-2 8.6M8 7.5h.1M15.9 7.5h.1"/></svg>
  if (type === 'duckdb') return <svg {...common}><circle cx="11.5" cy="12" r="7.5"/><circle cx="11.5" cy="12" r="3.8"/><path d="M15.3 10.8H20l2 1.5-2 1.5h-4.7"/><path d="M10.4 10.8h.1"/></svg>
  if (type === 'sqlite') return <svg {...common}><path d="M5 20c2.2-6.2 5.5-11.4 11.6-16.4 1.2-1 2.8-.3 2.6 1.3-.8 6.2-4.4 11.4-10 14.4"/><path d="M7.5 17.4c3.2-2.7 5.9-5.6 8.2-9M10.5 14.4l-1.3-3.1M13.2 11.2l2.9-.5"/></svg>
  if (type === 'bigquery') return <svg {...common}><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.1 16.1 4.3 4.3M7.6 13.8v-3M10.8 13.8V7.5M14 13.8V9.4"/></svg>
  if (type === 'prometheus') return <svg {...common}><path d="M12 3v4M6.3 5.3l2.8 2.8M17.7 5.3l-2.8 2.8M4 11h4M16 11h4"/><path d="M7 13a5 5 0 0 0 10 0M9 18h6M10 21h4"/></svg>
  if (type === 'tempo') return <svg {...common}><path d="M4 6h5M4 12h8M4 18h4"/><circle cx="12" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/><path d="m13.5 7.5 1 2.5M14 13.7l-2 2.6"/></svg>
  if (type === 'loki') return <svg {...common}><path d="M5 5h14M5 10h14M5 15h14M5 20h9"/><circle cx="8" cy="5" r="1"/><circle cx="16" cy="10" r="1"/></svg>
  return <svg {...common}><path d="M8 4h11v16H8M8 8h11M8 12h11M8 16h11M13 8v12"/><path d="M3 7h7v10H3Z" fill="currentColor" stroke="none"/><path d="m5 10 3 4M8 10l-3 4" stroke="var(--bg-3)"/></svg>
}
