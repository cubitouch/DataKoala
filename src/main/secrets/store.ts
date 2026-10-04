import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type SecretOwner = 'ai' | 'datasource'

export interface SecretStore {
  has(owner: SecretOwner, id: string): Promise<boolean>
  get(owner: SecretOwner, id: string): Promise<string | null>
  set(owner: SecretOwner, id: string, value: string): Promise<void>
  delete(owner: SecretOwner, id: string): Promise<void>
}

export interface Encryption {
  available(): Promise<boolean>
  encrypt(value: string): Promise<Buffer>
  decrypt(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}

export type SecureStorageErrorCode =
  | 'unavailable'
  | 'invalid-persistence'
  | 'encryption'

export class SecureStorageError extends Error {
  code: SecureStorageErrorCode

  constructor(code: SecureStorageErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export const SHARED_SECRETS_FILENAME = 'secrets.json'

type StoredSecrets = {
  version: 1
  secrets: unknown[]
}

const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function invalidPersistence(): SecureStorageError {
  return new SecureStorageError(
    'invalid-persistence',
    'Stored credential data is invalid or corrupted.',
  )
}

function parseStoredSecrets(data: string): StoredSecrets {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    throw invalidPersistence()
  }
  const root = objectRecord(value)
  if (!root || root.version !== 1 || !Array.isArray(root.secrets))
    throw invalidPersistence()
  return { version: 1, secrets: root.secrets }
}

function identity(value: unknown): { owner: string; id: string } | null {
  const entry = objectRecord(value)
  return entry &&
    typeof entry.owner === 'string' &&
    typeof entry.id === 'string'
    ? { owner: entry.owner, id: entry.id }
    : null
}

function matchingIndex(
  stored: StoredSecrets,
  owner: SecretOwner,
  id: string,
): number {
  const matches = stored.secrets.flatMap((entry, index) => {
    const key = identity(entry)
    return key?.owner === owner && key.id === id ? [index] : []
  })
  if (matches.length > 1) throw invalidPersistence()
  return matches[0] ?? -1
}

function encryptedBytes(value: unknown): Buffer {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 16000 ||
    !BASE64.test(value)
  )
    throw invalidPersistence()
  return Buffer.from(value, 'base64')
}

export async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function writeAtomic(
  directory: string,
  filename: string,
  value: string,
) {
  await mkdir(directory, { recursive: true })
  const path = join(directory, filename)
  const temporary = `${path}.tmp`
  await rm(temporary, { force: true })
  try {
    await writeFile(temporary, value, { mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export class EncryptedSecretStore implements SecretStore {
  private directory: string
  private encryption: Encryption
  private queue: Promise<unknown> = Promise.resolve()

  constructor(directory: string, encryption: Encryption) {
    this.directory = directory
    this.encryption = encryption
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation)
    this.queue = next.catch(() => {})
    return next
  }

  private path() {
    return join(this.directory, SHARED_SECRETS_FILENAME)
  }

  private async readStored(): Promise<StoredSecrets | null> {
    const data = await readOptional(this.path())
    return data === null ? null : parseStoredSecrets(data)
  }

  private async requireEncryption() {
    let available = false
    try {
      available = await this.encryption.available()
    } catch {
      available = false
    }
    if (!available)
      throw new SecureStorageError(
        'unavailable',
        'Secure credential storage is unavailable. Unlock your operating system keychain and try again.',
      )
  }

  private async encrypt(value: string): Promise<Buffer> {
    try {
      return await this.encryption.encrypt(value)
    } catch {
      throw new SecureStorageError(
        'encryption',
        'Secure credential storage could not encrypt the credential.',
      )
    }
  }

  private async decrypt(value: Buffer) {
    try {
      return await this.encryption.decrypt(value)
    } catch {
      throw new SecureStorageError(
        'encryption',
        'Stored credential data could not be decrypted.',
      )
    }
  }

  private async persist(stored: StoredSecrets) {
    await writeAtomic(
      this.directory,
      SHARED_SECRETS_FILENAME,
      JSON.stringify(stored),
    )
  }

  has(owner: SecretOwner, id: string) {
    return this.serialize(async () => {
      const stored = await this.readStored()
      if (!stored) return false
      const index = matchingIndex(stored, owner, id)
      if (index < 0) return false
      const entry = objectRecord(stored.secrets[index])
      encryptedBytes(entry?.encrypted)
      return true
    })
  }

  get(owner: SecretOwner, id: string) {
    return this.serialize(async () => {
      const stored = await this.readStored()
      if (!stored) return null
      const index = matchingIndex(stored, owner, id)
      if (index < 0) return null
      const entry = objectRecord(stored.secrets[index])
      const bytes = encryptedBytes(entry?.encrypted)
      await this.requireEncryption()
      const decrypted = await this.decrypt(bytes)
      if (decrypted.shouldReEncrypt) {
        const encrypted = await this.encrypt(decrypted.result)
        stored.secrets[index] = {
          owner,
          id,
          encrypted: encrypted.toString('base64'),
        }
        await this.persist(stored)
      }
      return decrypted.result
    })
  }

  set(owner: SecretOwner, id: string, value: string) {
    return this.serialize(async () => {
      await this.requireEncryption()
      const encrypted = await this.encrypt(value)
      const stored = (await this.readStored()) ?? {
        version: 1 as const,
        secrets: [],
      }
      const index = matchingIndex(stored, owner, id)
      const entry = { owner, id, encrypted: encrypted.toString('base64') }
      if (index < 0) stored.secrets.push(entry)
      else stored.secrets[index] = entry
      await this.persist(stored)
    })
  }

  delete(owner: SecretOwner, id: string) {
    return this.serialize(async () => {
      const stored = await this.readStored()
      if (!stored) return
      const next = stored.secrets.filter((entry) => {
        const key = identity(entry)
        return key?.owner !== owner || key.id !== id
      })
      if (next.length === stored.secrets.length) return
      if (next.length === 0) {
        await rm(this.path(), { force: true })
        return
      }
      await this.persist({ version: 1, secrets: next })
    })
  }
}
