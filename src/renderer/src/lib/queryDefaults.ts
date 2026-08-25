import type { DataSourceKind } from '@shared/types'
import type { QueryMode } from '../store/useStore'

export type QueryLanguage = 'sql' | 'promql' | 'traceql' | 'logql'

export function queryLanguageForDatasource(kind?: DataSourceKind): QueryLanguage {
  if (kind === 'prometheus') return 'promql'
  if (kind === 'tempo') return 'traceql'
  if (kind === 'loki') return 'logql'
  return 'sql'
}

export function defaultQueryModeForDatasource(kind?: DataSourceKind, builderSupported = true): QueryMode {
  void kind
  return builderSupported ? 'builder' : 'sql'
}

export function defaultQueryTextForDatasource(kind?: DataSourceKind): string {
  if (kind === 'prometheus') return 'up'
  if (kind === 'tempo') return '{ duration > 100ms }'
  if (kind === 'loki') return ''
  return 'select now();'
}
