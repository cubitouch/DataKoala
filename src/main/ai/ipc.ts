import { app, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { createElectronEncryption } from '../secrets/electron-encryption'
import { EncryptedSecretStore } from '../secrets/store'
import { AiService } from './service'
import { AiSettingsStore } from './settings'

export function registerAiIpc() {
  const directory = app.getPath('userData')
  const encryption = createElectronEncryption()
  const secrets = new EncryptedSecretStore(directory, encryption)
  const service = new AiService(
    new AiSettingsStore(directory, secrets, encryption),
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
  ipcMain.handle(IPC.AI_PROPOSE_BUILDER, (event, input: unknown) =>
    service.proposeBuilder(owner(event), input),
  )
  ipcMain.handle(IPC.AI_CANCEL, (event, id: unknown) =>
    service.cancel(owner(event), id),
  )
}
