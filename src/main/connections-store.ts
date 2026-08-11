import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DataSourceProfile } from '@shared/types'
import { migrateStoredProfile } from './profile-migration.ts'

const profiles = new Map<string, DataSourceProfile>()
const unsupportedProfiles: Record<string, unknown>[] = []
let loaded = false

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return resolve(dir, 'connections.json')
}

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const p = storePath()
    if (!existsSync(p)) return
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>[]
    let repaired = false
    for (const stored of raw) {
      const migration = migrateStoredProfile(stored)
      if (migration.status === 'unsupported') {
        unsupportedProfiles.push(stored)
        continue
      }
      const prof = migration.profile
      if (migration.status === 'migrated') repaired = true
      // Migration: earlier builds could persist a profile with an empty id, which
      // then read back as a falsy connection id and silently broke query execution.
      if (!isUsableId(prof.id)) {
        prof.id = randomUUID()
        repaired = true
      }
      profiles.set(prof.id, prof)
    }
    if (repaired) persist()
  } catch {
    // Corrupt file — start fresh.
  }
}

/** A connection id must be a non-empty string; '' is falsy and breaks callers. */
function isUsableId(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== ''
}

function persist(): void {
  try {
    writeFileSync(storePath(), JSON.stringify([...profiles.values(), ...unsupportedProfiles], null, 2), 'utf8')
  } catch {
    // Best-effort; ignore disk errors.
  }
}

export const connectionProfiles = {
  list(): DataSourceProfile[] {
    load()
    return [...profiles.values()]
  },
  get(id: string): DataSourceProfile | undefined {
    load()
    return profiles.get(id)
  },
  upsert(profile: Omit<DataSourceProfile, 'id'> & { id?: string }): DataSourceProfile {
    load()
    // Note: `profile.id ?? randomUUID()` is wrong here — the renderer sends '' for a
    // new profile, and ?? only falls back on null/undefined, so the id stayed empty.
    const id = isUsableId(profile.id) ? profile.id : randomUUID()
    const full: DataSourceProfile = { ...profile, id } as DataSourceProfile
    profiles.set(id, full)
    persist()
    return full
  },
  remove(id: string): void {
    load()
    profiles.delete(id)
    persist()
  }
}
