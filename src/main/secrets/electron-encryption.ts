import { safeStorage } from 'electron'
import type { Encryption } from './store.ts'

export function createElectronEncryption(): Encryption {
  return {
    available: async () =>
      (process.platform !== 'linux' ||
        !['basic_text', 'unknown'].includes(
          safeStorage.getSelectedStorageBackend(),
        )) &&
      (await safeStorage.isAsyncEncryptionAvailable()),
    encrypt: (value) => safeStorage.encryptStringAsync(value),
    decrypt: (value) => safeStorage.decryptStringAsync(value),
  }
}
