import type { DataSourceProfile } from '../shared/types.ts'

export type StoredProfileMigration =
  | { status: 'migrated'; profile: DataSourceProfile; stored: Record<string, unknown> }
  | { status: 'current'; profile: DataSourceProfile; stored: Record<string, unknown> }
  | { status: 'unsupported'; stored: Record<string, unknown> }

function isPostgresV1(stored: Record<string, unknown>): boolean {
  return stored.kind === 'postgres' && stored.version === 1 &&
    typeof stored.id === 'string' && typeof stored.name === 'string' &&
    typeof stored.host === 'string' && typeof stored.port === 'number' &&
    typeof stored.database === 'string' && typeof stored.user === 'string' &&
    typeof stored.password === 'string' && typeof stored.ssl === 'boolean' &&
    typeof stored.readonly === 'boolean'
}

function isLocalFilesV1(stored: Record<string, unknown>): boolean {
  return stored.kind === 'local-files' && stored.version === 1 && stored.readonly === true &&
    typeof stored.id === 'string' && typeof stored.name === 'string' && Array.isArray(stored.files) &&
    stored.files.every((file) => file && typeof file === 'object' &&
      typeof (file as Record<string, unknown>).path === 'string' && typeof (file as Record<string, unknown>).alias === 'string')
}
function isSqliteFileV1(stored: Record<string, unknown>): boolean {
  return stored.kind === 'sqlite-file' && stored.version === 1 && stored.readonly === true &&
    typeof stored.id === 'string' && typeof stored.name === 'string' && typeof stored.path === 'string'
}
function isBigQueryV1(stored: Record<string, unknown>): boolean {
  return stored.kind === 'bigquery' && stored.version === 1 && stored.readonly === true &&
    typeof stored.id === 'string' && typeof stored.name === 'string' &&
    typeof stored.billingProject === 'string' && typeof stored.maximumBytesBilled === 'string' &&
    (stored.maximumBytesBilled === '' || /^\d+$/.test(stored.maximumBytesBilled)) &&
    (stored.defaultProject === undefined || typeof stored.defaultProject === 'string') &&
    (stored.defaultDataset === undefined || typeof stored.defaultDataset === 'string') &&
    (stored.location === undefined || typeof stored.location === 'string')
}
function isPrometheusV1(stored: Record<string, unknown>): boolean {
  if (stored.kind !== 'prometheus' || stored.version !== 1 || stored.readonly !== true ||
    typeof stored.id !== 'string' || typeof stored.name !== 'string' || !stored.transport || typeof stored.transport !== 'object') return false
  const transport = stored.transport as Record<string, unknown>
  return transport.kind === 'gcx' && (transport.context === undefined || typeof transport.context === 'string') &&
    (transport.datasourceUid === undefined || typeof transport.datasourceUid === 'string')
}

/** Classify persisted profiles without ever rewriting formats this app does not understand. */
export function migrateStoredProfile(stored: Record<string, unknown>): StoredProfileMigration {
  if (stored.kind === undefined && stored.version === undefined) {
    const migrated = { ...stored, kind: 'postgres', version: 1 }
    if (!isPostgresV1(migrated)) return { status: 'unsupported', stored }
    return { status: 'migrated', profile: migrated as unknown as DataSourceProfile, stored: migrated }
  }
  if (isPostgresV1(stored)) {
    return { status: 'current', profile: stored as unknown as DataSourceProfile, stored }
  }
  if (isLocalFilesV1(stored)) return { status: 'current', profile: stored as unknown as DataSourceProfile, stored }
  if (isSqliteFileV1(stored)) return { status: 'current', profile: stored as unknown as DataSourceProfile, stored }
  if (stored.kind === 'bigquery' && stored.version === 1 && stored.maximumBytesBilled === undefined) {
    const migrated = { ...stored, maximumBytesBilled: '' }
    if (isBigQueryV1(migrated)) return { status: 'migrated', profile: migrated as unknown as DataSourceProfile, stored: migrated }
  }
  if (isBigQueryV1(stored)) return { status: 'current', profile: stored as unknown as DataSourceProfile, stored }
  if (isPrometheusV1(stored)) return { status: 'current', profile: stored as unknown as DataSourceProfile, stored }
  return { status: 'unsupported', stored }
}
