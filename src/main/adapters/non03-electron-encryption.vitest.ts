import { afterEach, expect, test, vi } from 'vitest'
import { createElectronEncryption } from '../secrets/electron-encryption'

const storage = vi.hoisted(() => ({
  getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  encryptStringAsync: vi.fn(async () => Buffer.from('synthetic')),
  decryptStringAsync: vi.fn(async () => ({
    result: 'synthetic',
    shouldReEncrypt: false,
  })),
}))
vi.mock('electron', () => ({ safeStorage: storage }))
afterEach(() => vi.restoreAllMocks())

test('NON03 Linux refuses insecure backends even when Electron reports encryption available', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  for (const backend of ['basic_text', 'unknown']) {
    storage.getSelectedStorageBackend.mockReturnValue(backend)
    expect(await createElectronEncryption().available()).toBe(false)
  }
  storage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret')
  expect(await createElectronEncryption().available()).toBe(true)
  storage.isAsyncEncryptionAvailable.mockResolvedValueOnce(false)
  expect(await createElectronEncryption().available()).toBe(false)
  expect(storage.encryptStringAsync).not.toHaveBeenCalled()
})

test('NON03 macOS and Windows require Electron availability without consulting Linux backend', async () => {
  for (const platform of ['darwin', 'win32'] as const) {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
    storage.isAsyncEncryptionAvailable.mockResolvedValueOnce(false)
    expect(await createElectronEncryption().available()).toBe(false)
    storage.isAsyncEncryptionAvailable.mockResolvedValueOnce(true)
    expect(await createElectronEncryption().available()).toBe(true)
  }
  expect(storage.getSelectedStorageBackend).not.toHaveBeenCalled()
})
