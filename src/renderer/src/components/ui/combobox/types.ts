import type { ReactNode } from 'react'

export type ComboboxOptionValue = string

export interface ComboboxOption {
  value: ComboboxOptionValue
  label: string
  subtitle?: string
  icon?: ReactNode
  avatarUrl?: string
  disabled?: boolean
  keywords?: string[]
}
