import { describe, expect, it } from 'vitest'
import type { ConnectionProfile } from '@shared/types'
import {
  buildConnectionProfileDraft,
  draftFromProfile,
  type ConnectionDraft,
} from './connectionDraft'

function baseDraft(overrides: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    id: '',
    name: 'Example database',
    host: 'db.internal',
    port: '5432',
    database: 'example_db',
    user: 'example-reader@example.iam',
    password: '',
    tlsMode: 'disable',
    readonly: true,
    teleportEnabled: true,
    teleportDbService: 'example-postgres',
    teleportTunnelPort: '15433',
    teleportTshPath: '',
    ...overrides,
  }
}

describe('connectionDraft Teleport settings', () => {
  it('builds a Teleport preConnect from the tunnel fields', () => {
    const result = buildConnectionProfileDraft(baseDraft())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.preConnect).toEqual({
      mode: 'teleport',
      dbService: 'example-postgres',
      tunnelPort: 15433,
    })
  })

  it('keeps User and Database as the single Teleport user and name', () => {
    const result = buildConnectionProfileDraft(
      baseDraft({ user: 'db-user@example.iam', database: 'example_db' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The tunnel derives --db-user/--db-name from the connection user/database.
    expect(result.profile.user).toBe('db-user@example.iam')
    expect(result.profile.database).toBe('example_db')
    expect(result.profile.preConnect).not.toHaveProperty('dbUser')
    expect(result.profile.preConnect).not.toHaveProperty('dbName')
  })

  it('omits preConnect while Teleport is disabled', () => {
    const result = buildConnectionProfileDraft(
      baseDraft({ teleportEnabled: false }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.preConnect).toBeUndefined()
  })

  it('passes through an optional tsh path', () => {
    const result = buildConnectionProfileDraft(
      baseDraft({ teleportTshPath: '/opt/teleport/tsh' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.preConnect).toMatchObject({
      tshPath: '/opt/teleport/tsh',
    })
  })

  it('requires a database service when Teleport is enabled', () => {
    const result = buildConnectionProfileDraft(
      baseDraft({ teleportDbService: '  ' }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.teleportDbService).toBeTruthy()
  })

  it('still requires User and Database with the tunnel on', () => {
    const missing = buildConnectionProfileDraft(
      baseDraft({ user: '', database: '' }),
    )
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.errors.user).toBeTruthy()
    expect(missing.errors.database).toBeTruthy()
  })

  it('does not require Host or Port while the tunnel is on', () => {
    const result = buildConnectionProfileDraft(
      baseDraft({ host: '', port: '' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The tunnel ignores host/port, but a valid port is still persisted.
    expect(result.profile.port).toBe(5432)
    expect(result.profile.host).toBe('')
  })

  it('rejects an out-of-range tunnel port', () => {
    const badPort = buildConnectionProfileDraft(
      baseDraft({ teleportTunnelPort: '70000' }),
    )
    expect(badPort.ok).toBe(false)
    if (!badPort.ok) expect(badPort.errors.teleportTunnelPort).toBeTruthy()
  })

  it('round-trips a profile through the draft', () => {
    const profile: ConnectionProfile = {
      kind: 'postgres',
      version: 2,
      id: 'p1',
      name: 'Example database',
      host: 'db.internal',
      port: 5432,
      database: 'example_db',
      user: 'reader@corp',
      password: '',
      tlsMode: 'disable',
      readonly: true,
      preConnect: {
        mode: 'teleport',
        dbService: 'example-postgres',
        tunnelPort: 15433,
      },
    }
    const draft = draftFromProfile(profile)
    expect(draft.teleportEnabled).toBe(true)
    expect(draft.teleportDbService).toBe('example-postgres')
    expect(draft.teleportTunnelPort).toBe('15433')

    const rebuilt = buildConnectionProfileDraft(draft)
    expect(rebuilt.ok).toBe(true)
    if (!rebuilt.ok) return
    expect(rebuilt.profile.preConnect).toEqual(profile.preConnect)
  })
})
