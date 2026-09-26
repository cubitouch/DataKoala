import type { DataSourceProfile } from '@shared/types'

export interface ConnectionModalProps {
  existing: DataSourceProfile | null
  onClose: () => void
  onSaved: (profile: DataSourceProfile) => void
}

export type ConnectionFormProps = ConnectionModalProps & {
  onBack?: () => void
  active?: boolean
}

export const failureMessage = (value: unknown): string => {
  if (value instanceof Error && value.message.trim()) return value.message
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'error' in value) {
    const error = (value as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) return error
  }
  return 'Connection test failed. The server did not provide an error message.'
}
