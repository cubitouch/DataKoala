import type { AiErrorCode, AiSettingsInput } from '../../../shared/ai.ts'

export class AiError extends Error {
  code: AiErrorCode
  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AiError('validation', 'Invalid AI request.')
  return value as Record<string, unknown>
}
export function textValue(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new AiError('validation', 'Invalid or oversized AI input.')
  return value
}
export function requestId(value: unknown): string {
  return textValue(value, 128)
}
export function settingsInput(value: unknown): AiSettingsInput {
  const input = record(value)
  return {
    model: textValue(input.model, 256),
    ...(input.apiKey === undefined
      ? {}
      : { apiKey: textValue(input.apiKey, 1024, true).trim() }),
  }
}
