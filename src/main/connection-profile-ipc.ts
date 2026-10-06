import type { IpcMain } from 'electron'
import type { DataSourceProfile } from '../shared/types.ts'
import { IPC } from '../shared/ipc-channels.ts'
import type { ConnectionProfileStore } from './connections-store.ts'

export function registerConnectionProfileIpc(
  ipc: Pick<IpcMain, 'handle'>,
  profiles: ConnectionProfileStore,
): void {
  ipc.handle('connections:list', () => profiles.list())
  ipc.handle('connections:upsert', (_event, profile: DataSourceProfile) =>
    profiles.upsert(profile),
  )
  ipc.handle(IPC.CONNECTION_RETRY_CREDENTIAL_MIGRATION, (_event, id: string) =>
    profiles.retryMigration(id),
  )
}
