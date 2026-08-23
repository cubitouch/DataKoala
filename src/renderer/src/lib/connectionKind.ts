import type { DataSourceProfile } from '@shared/types'

export function connectionKindLabel(kind: DataSourceProfile['kind']): string {
  switch (kind) {
    case 'postgres': return 'PostgreSQL'
    case 'bigquery': return 'BigQuery'
    case 'local-files': return 'Local files'
    case 'sqlite-file': return 'SQLite'
    case 'prometheus': return 'Prometheus'
    case 'tempo': return 'Tempo'
    case 'loki': return 'Loki'
  }
}
