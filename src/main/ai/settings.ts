import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AiSettingsInput, AiSettingsSummary } from '../../shared/ai.ts'
import type { Encryption, SecretStore } from '../secrets/store.ts'
import {
  SecureStorageError,
  readOptional,
  writeAtomic,
} from '../secrets/store.ts'
import { record, textValue } from './validation.ts'

const OPENROUTER_SECRET = {
  owner: 'ai',
  id: 'openrouter-api-key',
} as const
const LEGACY_SECRETS_FILENAME = 'ai-secrets.json'
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function legacyEncryptedBytes(data: string): Buffer {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    throw new SecureStorageError(
      'invalid-persistence',
      'Stored AI credential data is invalid or corrupted.',
    )
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SecureStorageError(
      'invalid-persistence',
      'Stored AI credential data is invalid or corrupted.',
    )
  const stored = value as Record<string, unknown>
  if (
    stored.version !== 1 ||
    typeof stored.encrypted !== 'string' ||
    !stored.encrypted ||
    stored.encrypted.length > 16000 ||
    !BASE64.test(stored.encrypted)
  )
    throw new SecureStorageError(
      'invalid-persistence',
      'Stored AI credential data is invalid or corrupted.',
    )
  return Buffer.from(stored.encrypted, 'base64')
}

async function encryptionAvailable(encryption: Encryption) {
  try {
    return await encryption.available()
  } catch {
    return false
  }
}

async function decryptLegacySecret(
  data: string,
  encryption: Encryption,
): Promise<string> {
  if (!(await encryptionAvailable(encryption)))
    throw new SecureStorageError(
      'unavailable',
      'Secure credential storage is unavailable. Unlock your operating system keychain and try again.',
    )
  try {
    return (await encryption.decrypt(legacyEncryptedBytes(data))).result
  } catch (error) {
    if (error instanceof SecureStorageError) throw error
    throw new SecureStorageError(
      'encryption',
      'Stored AI credential data could not be decrypted.',
    )
  }
}

export class AiSettingsStore {
  private directory: string
  private secrets: SecretStore
  private encryption: Encryption
  private queue: Promise<unknown> = Promise.resolve()
  private migrating: Promise<void> | null = null

  constructor(directory: string, secrets: SecretStore, encryption: Encryption) {
    this.directory = directory
    this.secrets = secrets
    this.encryption = encryption
  }

  private legacyPath() {
    return join(this.directory, LEGACY_SECRETS_FILENAME)
  }

  private async migrateLegacySecret() {
    const legacy = await readOptional(this.legacyPath())
    if (await this.secrets.has(OPENROUTER_SECRET.owner, OPENROUTER_SECRET.id)) {
      if (legacy !== null && (await encryptionAvailable(this.encryption))) {
        const shared = await this.secrets.get(
          OPENROUTER_SECRET.owner,
          OPENROUTER_SECRET.id,
        )
        if (shared !== null) await rm(this.legacyPath(), { force: true })
      }
      return
    }
    if (legacy === null || !(await encryptionAvailable(this.encryption))) return

    const value = await decryptLegacySecret(legacy, this.encryption)
    await this.secrets.set(OPENROUTER_SECRET.owner, OPENROUTER_SECRET.id, value)
    const persisted = await this.secrets.get(
      OPENROUTER_SECRET.owner,
      OPENROUTER_SECRET.id,
    )
    if (persisted !== value)
      throw new SecureStorageError(
        'encryption',
        'Stored AI credential data could not be migrated safely.',
      )
    await rm(this.legacyPath())
  }

  private ensureLegacyMigration() {
    if (this.migrating) return this.migrating
    const current = this.migrateLegacySecret()
    this.migrating = current
    void current.then(
      () => {
        if (this.migrating === current) this.migrating = null
      },
      () => {
        if (this.migrating === current) this.migrating = null
      },
    )
    return current
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation)
    this.queue = next.catch(() => {})
    return next
  }

  private async tryLegacyMigration() {
    try {
      await this.ensureLegacyMigration()
    } catch {
      // The legacy encrypted file remains the fallback until migration succeeds.
    }
  }

  async get(): Promise<AiSettingsSummary> {
    await this.tryLegacyMigration()
    const data = await readOptional(join(this.directory, 'ai-settings.json'))
    const model =
      data === null ? '' : textValue(record(JSON.parse(data)).model, 256, true)
    const legacy = await readOptional(this.legacyPath())
    return {
      provider: 'openrouter',
      model,
      hasApiKey:
        legacy !== null ||
        (await this.secrets.has(
          OPENROUTER_SECRET.owner,
          OPENROUTER_SECRET.id,
        )),
    }
  }

  async getApiKey(): Promise<string | null> {
    await this.tryLegacyMigration()
    const legacy = await readOptional(this.legacyPath())
    try {
      const shared = await this.secrets.get(
        OPENROUTER_SECRET.owner,
        OPENROUTER_SECRET.id,
      )
      if (shared !== null) return shared
    } catch (error) {
      if (legacy === null) throw error
    }
    return legacy === null ? null : decryptLegacySecret(legacy, this.encryption)
  }

  save(input: AiSettingsInput) {
    return this.serialize(async () => {
      if (input.apiKey) {
        await this.secrets.set(
          OPENROUTER_SECRET.owner,
          OPENROUTER_SECRET.id,
          input.apiKey,
        )
        await rm(this.legacyPath(), { force: true })
      } else {
        await this.tryLegacyMigration()
      }
      await writeAtomic(
        this.directory,
        'ai-settings.json',
        JSON.stringify({
          version: 1,
          provider: 'openrouter',
          model: input.model,
        }),
      )
      return this.get()
    })
  }

  removeApiKey() {
    return this.serialize(async () => {
      if (this.migrating) {
        try {
          await this.migrating
        } catch {
          // Explicit removal should still be able to clear a legacy secret.
        }
      }
      await this.secrets.delete(OPENROUTER_SECRET.owner, OPENROUTER_SECRET.id)
      await rm(this.legacyPath(), { force: true })
      return this.get()
    })
  }
}
