import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AiSettingsInput, AiSettingsSummary } from '../../shared/ai.ts'
import { AiError, record, textValue } from './validation.ts'
export interface SecretStore {
  has(): Promise<boolean>
  get(): Promise<string | null>
  set(value: string): Promise<void>
  delete(): Promise<void>
}
export interface Encryption {
  available(): Promise<boolean>
  encrypt(value: string): Promise<Buffer>
  decrypt(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}
async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
async function writeAtomic(directory: string, filename: string, value: string) {
  await mkdir(directory, { recursive: true })
  const path = join(directory, filename),
    temporary = `${path}.tmp`
  await writeFile(temporary, value, { mode: 0o600 })
  await rename(temporary, path)
}
export class EncryptedSecretStore implements SecretStore {
  private directory: string
  private encryption: Encryption
  constructor(directory: string, encryption: Encryption) {
    this.directory = directory
    this.encryption = encryption
  }
  async has() {
    return (
      (await readOptional(join(this.directory, 'ai-secrets.json'))) !== null
    )
  }
  async get() {
    const data = await readOptional(join(this.directory, 'ai-secrets.json'))
    if (data === null) return null
    if (!(await this.encryption.available()))
      throw new AiError(
        'configuration',
        'Secure credential storage is unavailable. Unlock your operating system keychain and try again.',
      )
    const stored = record(JSON.parse(data))
    const decrypted = await this.encryption.decrypt(
      Buffer.from(textValue(stored.encrypted, 16000), 'base64'),
    )
    if (decrypted.shouldReEncrypt) await this.set(decrypted.result)
    return decrypted.result
  }
  async set(value: string) {
    if (!(await this.encryption.available()))
      throw new AiError(
        'configuration',
        'Secure credential storage is unavailable. The API key was not saved.',
      )
    const encrypted = await this.encryption.encrypt(value)
    await writeAtomic(
      this.directory,
      'ai-secrets.json',
      JSON.stringify({ version: 1, encrypted: encrypted.toString('base64') }),
    )
  }
  async delete() {
    await rm(join(this.directory, 'ai-secrets.json'), { force: true })
  }
}
export class AiSettingsStore {
  private directory: string
  secrets: SecretStore
  private queue: Promise<unknown> = Promise.resolve()
  constructor(directory: string, secrets: SecretStore) {
    this.directory = directory
    this.secrets = secrets
  }
  async get(): Promise<AiSettingsSummary> {
    const data = await readOptional(join(this.directory, 'ai-settings.json'))
    const model =
      data === null ? '' : textValue(record(JSON.parse(data)).model, 256, true)
    return {
      provider: 'openrouter',
      model,
      hasApiKey: await this.secrets.has(),
    }
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation)
    this.queue = next.catch(() => {})
    return next
  }
  save(input: AiSettingsInput) {
    return this.serialize(async () => {
      if (input.apiKey) await this.secrets.set(input.apiKey)
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
      await this.secrets.delete()
      return this.get()
    })
  }
}
