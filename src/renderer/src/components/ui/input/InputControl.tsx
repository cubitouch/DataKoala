import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import styles from './InputControl.module.css'

export interface InputControlProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange'> {
  appearance?: 'field' | 'embedded'
  onValueChange?: (value: string) => void
}

export const InputControl = forwardRef<HTMLInputElement, InputControlProps>(function InputControl({ appearance = 'field', onValueChange, ...props }, ref) {
  return <input ref={ref} {...props} onChange={(event) => onValueChange?.(event.currentTarget.value)} className={`${styles.input} ${appearance === 'embedded' ? styles.embedded : ''}`} />
})
