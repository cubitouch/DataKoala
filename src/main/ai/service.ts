import type { AiResult } from '../../shared/ai.ts'
import { SecureStorageError } from '../secrets/store.ts'
import { OpenRouterProvider } from './openrouter.ts'
import type { AiProvider } from './openrouter.ts'
import { AiSettingsStore } from './settings.ts'
import {
  AiError,
  anomalyAnalysisRequest,
  builderProposalRequest,
  proposalRequest,
  planAnalysisRequest,
  requestId,
  settingsInput,
} from './validation.ts'
export class AiService {
  private settings: AiSettingsStore
  private createProvider: (key: string, model: string) => AiProvider
  private timeoutMs: number
  private requests = new Map<string, AbortController>()
  constructor(
    settings: AiSettingsStore,
    createProvider = (key: string, model: string): AiProvider =>
      new OpenRouterProvider(key, model),
    timeoutMs = 60000,
  ) {
    this.settings = settings
    this.createProvider = createProvider
    this.timeoutMs = timeoutMs
  }
  async result<T>(operation: () => Promise<T>): Promise<AiResult<T>> {
    try {
      return { ok: true, value: await operation() }
    } catch (error) {
      if (error instanceof AiError)
        return { ok: false, code: error.code, message: error.message }
      if (error instanceof SecureStorageError)
        return {
          ok: false,
          code: 'configuration',
          message: error.message,
        }
      return {
        ok: false,
        code: 'provider',
        message: 'The AI operation failed. Check AI settings and try again.',
      }
    }
  }
  getSettings() {
    return this.result(() => this.settings.get())
  }
  saveSettings(input: unknown) {
    return this.result(() => this.settings.save(settingsInput(input)))
  }
  removeApiKey() {
    return this.result(() => this.settings.removeApiKey())
  }
  cancel(owner: number, id: unknown) {
    return this.result(async () => {
      this.requests
        .get(`${owner}:${requestId(id)}`)
        ?.abort(new AiError('cancelled', 'Request cancelled.'))
    })
  }
  cancelOwner(owner: number) {
    for (const [key, controller] of this.requests)
      if (key.startsWith(`${owner}:`))
        controller.abort(new AiError('cancelled', 'Request cancelled.'))
  }
  private async run<T>(
    owner: number,
    id: unknown,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<AiResult<T>> {
    return this.result(async () => {
      const key = `${owner}:${requestId(id)}`
      if (this.requests.has(key))
        throw new AiError(
          'validation',
          'An AI request with this ID is already running.',
        )
      if (this.requests.size >= 16)
        throw new AiError(
          'rate-limit',
          'Too many AI requests. Wait for an active request to finish.',
        )
      const controller = new AbortController()
      this.requests.set(key, controller)
      const timeout = setTimeout(
        () =>
          controller.abort(
            new AiError(
              'timeout',
              'OpenRouter did not respond before the request timed out.',
            ),
          ),
        this.timeoutMs,
      )
      let onAbort: () => void = () => {}
      try {
        const cancelled = new Promise<never>((_, reject) => {
          onAbort = () => reject(controller.signal.reason)
          controller.signal.addEventListener('abort', onAbort, { once: true })
        })
        return await Promise.race([operation(controller.signal), cancelled])
      } finally {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort', onAbort)
        this.requests.delete(key)
      }
    })
  }
  listModels(owner: number, id: unknown) {
    return this.run(owner, id, (signal) =>
      this.createProvider('', '').listModels(signal),
    )
  }
  test(owner: number, id: unknown, input: unknown) {
    return this.run(owner, id, async (signal) => {
      const draft = settingsInput(input)
      const key = draft.apiKey || (await this.settings.getApiKey())
      if (!key)
        throw new AiError(
          'configuration',
          'Configure OpenRouter to use Ask AI.',
        )
      signal.throwIfAborted()
      await this.createProvider(key, draft.model).test(signal)
    })
  }
  proposeQuery(owner: number, input: unknown) {
    return this.result(async () => {
      const request = proposalRequest(input)
      const response = await this.run(
        owner,
        request.requestId,
        async (signal) => {
          const settings = await this.settings.get(),
            key = await this.settings.getApiKey()
          if (!settings.model || !key)
            throw new AiError(
              'configuration',
              'Configure OpenRouter to use Ask AI.',
            )
          signal.throwIfAborted()
          return this.createProvider(key, settings.model).proposeQuery(
            request,
            signal,
          )
        },
      )
      if (!response.ok) throw new AiError(response.code, response.message)
      return response.value
    })
  }
  analyzeAnomalies(owner: number, input: unknown) {
    return this.result(async () => {
      const request = anomalyAnalysisRequest(input)
      const response = await this.run(
        owner,
        request.requestId,
        async (signal) => {
          const settings = await this.settings.get()
          const key = await this.settings.getApiKey()
          if (!settings.model || !key)
            throw new AiError(
              'configuration',
              'Configure OpenRouter to use AI analysis.',
            )
          signal.throwIfAborted()
          return this.createProvider(key, settings.model).analyzeAnomalies(
            request,
            signal,
          )
        },
      )
      if (!response.ok) throw new AiError(response.code, response.message)
      return response.value
    })
  }
  proposeBuilder(owner: number, input: unknown) {
    return this.result(async () => {
      const request = builderProposalRequest(input)
      const response = await this.run(
        owner,
        request.requestId,
        async (signal) => {
          const settings = await this.settings.get()
          const key = await this.settings.getApiKey()
          if (!settings.model || !key)
            throw new AiError(
              'configuration',
              'Configure OpenRouter to use Ask AI.',
            )
          signal.throwIfAborted()
          return this.createProvider(key, settings.model).proposeBuilder(
            request,
            signal,
          )
        },
      )
      if (!response.ok) throw new AiError(response.code, response.message)
      return response.value
    })
  }
  analyzePlan(owner: number, input: unknown) {
    return this.result(async () => {
      const request = planAnalysisRequest(input)
      const response = await this.run(
        owner,
        request.requestId,
        async (signal) => {
          const settings = await this.settings.get()
          const key = await this.settings.getApiKey()
          if (!settings.model || !key)
            throw new AiError(
              'configuration',
              'Configure OpenRouter to analyze execution plans.',
            )
          signal.throwIfAborted()
          return this.createProvider(key, settings.model).analyzePlan(
            request,
            signal,
          )
        },
      )
      if (!response.ok) throw new AiError(response.code, response.message)
      return response.value
    })
  }
}
