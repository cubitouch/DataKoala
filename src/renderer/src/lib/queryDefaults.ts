import type { DataSourceKind } from '@shared/types'
import type { QueryMode } from '../store/useStore'

export function defaultQueryModeForDatasource(kind?: DataSourceKind, builderSupported = true): QueryMode {
  void kind
  return builderSupported ? 'builder' : 'sql'
}

export function defaultQueryTextForDatasource(kind?: DataSourceKind): string {
  if (kind === 'prometheus') return 'up'
  if (kind === 'tempo') return '{ duration > 100ms }'
  return 'select now();'
}
