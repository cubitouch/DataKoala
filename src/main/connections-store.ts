import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { DataSourceProfile, PostgresProfile } from '@shared/types'
import type { SecretStore } from './secrets/store.ts'
import { readOptional, writeAtomic } from './secrets/store.ts'
import { migrateStoredProfile } from './profile-migration.ts'

const FILENAME = 'connections.json'
const SAVE_UNAVAILABLE =
  'Secure credential storage is unavailable, so DataKoala cannot save this password. Leave it empty to use an external PostgreSQL credential mechanism, or retry after OS credential storage becomes available.'

function usableId(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== ''
}

function storedProfile(profile: DataSourceProfile): Record<string, unknown> {
  if (profile.kind !== 'postgres') return { ...profile }
  const {
    password: _password,
    hasPassword: _has,
    credentialState: _state,
    ...metadata
  } = profile
  return metadata
}

function safePostgres(
  profile: PostgresProfile,
  state: PostgresProfile['credentialState'],
): PostgresProfile {
  return {
    ...profile,
    password: '',
    hasPassword: state !== 'none',
    credentialState: state,
  }
}

/** Owns metadata and credentials and is the only persistence boundary for profiles. */
export class ConnectionProfileStore {
  private profiles = new Map<string, DataSourceProfile>()
  private unsupported: Record<string, unknown>[] = []
  private legacyPasswords = new Map<string, string>()
  private loaded = false
  private queue: Promise<void> = Promise.resolve()
  private directory: string
  private secrets: SecretStore

  constructor(directory: string, secrets: SecretStore) {
    this.directory = directory
    this.secrets = secrets
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.then(
      () => {},
      () => {},
    )
    return result
  }

  private async persist() {
    await writeAtomic(
      this.directory,
      FILENAME,
      JSON.stringify(
        [...this.profiles.values()].map(storedProfile).concat(this.unsupported),
        null,
        2,
      ),
    )
  }

  private async load() {
    if (this.loaded) return
    this.loaded = true
    const text = await readOptional(join(this.directory, FILENAME))
    if (text === null) return
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return
    }
    if (!Array.isArray(raw)) return
    let rewrite = false
    for (const value of raw) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const stored = value as Record<string, unknown>
      const migration = migrateStoredProfile(stored)
      if (migration.status === 'unsupported') {
        this.unsupported.push(stored)
        continue
      }
      const profile = migration.profile
      if (!usableId(profile.id)) {
        profile.id = randomUUID()
        rewrite = true
      }
      if (profile.kind !== 'postgres') {
        this.profiles.set(profile.id, profile)
        rewrite ||= migration.status === 'migrated'
        continue
      }
      const legacy = typeof stored.password === 'string' ? stored.password : ''
      let state: PostgresProfile['credentialState'] = 'none'
      try {
        const existing = await this.secrets.get('datasource', profile.id)
        if (existing !== null) state = 'secure'
        else if (legacy) {
          await this.secrets.set('datasource', profile.id, legacy)
          if ((await this.secrets.get('datasource', profile.id)) !== legacy)
            throw new Error('Secure credential verification failed.')
          state = 'secure'
        }
        rewrite ||=
          stored.password !== undefined || migration.status === 'migrated'
      } catch {
        if (legacy) {
          this.legacyPasswords.set(profile.id, legacy)
          state = 'legacy-plaintext'
          rewrite = false
        }
      }
      this.profiles.set(profile.id, safePostgres(profile, state))
    }
    if (rewrite && this.legacyPasswords.size === 0) await this.persist()
  }

  list() {
    return this.serialize(async () => {
      await this.load()
      return [...this.profiles.values()].map((profile) => ({ ...profile }))
    })
  }

  get(id: string) {
    return this.serialize(async () => {
      await this.load()
      const profile = this.profiles.get(id)
      return profile ? { ...profile } : undefined
    })
  }

  upsert(profile: Omit<DataSourceProfile, 'id'> & { id?: string }) {
    return this.serialize(async () => {
      await this.load()
      const id = usableId(profile.id) ? profile.id : randomUUID()
      let full = { ...profile, id } as DataSourceProfile
      if (full.kind === 'postgres') {
        const current = this.profiles.get(id)
        if (full.password) {
          try {
            await this.secrets.set('datasource', id, full.password)
            if ((await this.secrets.get('datasource', id)) !== full.password)
              throw new Error('Secure credential verification failed.')
          } catch {
            throw new Error(SAVE_UNAVAILABLE)
          }
          this.legacyPasswords.delete(id)
          full = safePostgres(full, 'secure')
        } else if (full.hasPassword === false) {
          await this.secrets.delete('datasource', id)
          this.legacyPasswords.delete(id)
          full = safePostgres(full, 'none')
        } else if (current?.kind === 'postgres') {
          if (current.credentialState === 'legacy-plaintext')
            throw new Error(
              'This legacy password could not be migrated. Retry secure storage or remove the saved password before saving changes.',
            )
          full = safePostgres(full, current.credentialState ?? 'none')
        } else full = safePostgres(full, 'none')
      }
      const previous = this.profiles.get(id)
      this.profiles.set(id, full)
      try {
        await this.persist()
      } catch (error) {
        if (previous) this.profiles.set(id, previous)
        else this.profiles.delete(id)
        throw error
      }
      return { ...full }
    })
  }

  remove(id: string) {
    return this.serialize(async () => {
      await this.load()
      const remaining = new Map(this.profiles)
      remaining.delete(id)
      const previous = this.profiles
      this.profiles = remaining
      try {
        await this.persist()
      } catch (error) {
        this.profiles = previous
        throw error
      }
      this.legacyPasswords.delete(id)
      await this.secrets.delete('datasource', id)
    })
  }

  resolveForConnection(profile: DataSourceProfile) {
    return this.serialize(async () => {
      await this.load()
      if (profile.kind !== 'postgres' || profile.password) return { ...profile }
      if (profile.hasPassword === false) return { ...profile, password: '' }
      const saved = this.profiles.get(profile.id)
      if (saved?.kind !== 'postgres') return { ...profile, password: '' }
      const password =
        saved.credentialState === 'legacy-plaintext'
          ? (this.legacyPasswords.get(profile.id) ?? '')
          : ((await this.secrets.get('datasource', profile.id)) ?? '')
      return { ...profile, password }
    })
  }

  retryMigration(id: string) {
    return this.serialize(async () => {
      await this.load()
      const profile = this.profiles.get(id)
      const legacy = this.legacyPasswords.get(id)
      if (profile?.kind !== 'postgres' || !legacy) return profile
      await this.secrets.set('datasource', id, legacy)
      if ((await this.secrets.get('datasource', id)) !== legacy)
        throw new Error('Secure credential verification failed.')
      const secured = safePostgres(profile, 'secure')
      this.profiles.set(id, secured)
      try {
        await this.persist()
      } catch (error) {
        this.profiles.set(id, profile)
        throw error
      }
      this.legacyPasswords.delete(id)
      return { ...secured }
    })
  }
}
