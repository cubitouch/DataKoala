import { app, ipcMain, safeStorage } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { AiService } from './service'
import { AiSettingsStore, EncryptedSecretStore } from './settings'
export function registerAiIpc() {
  const secrets = new EncryptedSecretStore(app.getPath('userData'), {
    available: async () =>
      (process.platform !== 'linux' ||
        !['basic_text', 'unknown'].includes(
          safeStorage.getSelectedStorageBackend(),
        )) &&
      (await safeStorage.isAsyncEncryptionAvailable()),
    encrypt: (value) => safeStorage.encryptStringAsync(value),
    decrypt: (value) => safeStorage.decryptStringAsync(value),
  })
  const service = new AiService(
    new AiSettingsStore(app.getPath('userData'), secrets),
  )
  const owners = new Set<number>()
  const owner = (event: Electron.IpcMainInvokeEvent) => {
    const id = event.sender.id
    if (!owners.has(id)) {
      owners.add(id)
      event.sender.once('destroyed', () => {
        service.cancelOwner(id)
        owners.delete(id)
      })
    }
    return id
  }
  ipcMain.handle(IPC.AI_SETTINGS_GET, () => service.getSettings())
  ipcMain.handle(IPC.AI_SETTINGS_SAVE, (_event, input: unknown) =>
    service.saveSettings(input),
  )
  ipcMain.handle(IPC.AI_KEY_REMOVE, () => service.removeApiKey())
  ipcMain.handle(IPC.AI_MODELS, (event, id: unknown) =>
    service.listModels(owner(event), id),
  )
  ipcMain.handle(IPC.AI_TEST, (event, id: unknown, input: unknown) =>
    service.test(owner(event), id, input),
  )
  ipcMain.handle(IPC.AI_PROPOSE, (event, input: unknown) =>
    service.proposeQuery(owner(event), input),
  )
  ipcMain.handle(IPC.AI_CANCEL, (event, id: unknown) =>
    service.cancel(owner(event), id),
  )
}
