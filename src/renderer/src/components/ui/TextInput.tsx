import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { InfoTooltip } from './InfoTooltip'
import styles from './TextInput.module.css'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'type'> {
  className?: string
  mode?: 'normal' | 'inline'
  type?: 'text' | 'search' | 'password' | 'number' | 'time'
  hint?: string
  warning?: string
  error?: string
  onValueChange?: (value: string) => void
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ className, mode = 'normal', type = 'text', hint, warning, error, onValueChange, 'aria-describedby': describedBy, ...props }, ref) {
  const generatedId = useId()
  const feedback = error ?? warning ?? hint
  const tone = error ? 'error' : warning ? 'warning' : 'info'
  const feedbackId = feedback ? `${generatedId}-feedback` : undefined
  const description = [describedBy, feedbackId].filter(Boolean).join(' ') || undefined
  return <span className={`${styles.root} ${styles[mode]} ${feedback ? styles[tone] : ''}${className ? ` ${className}` : ''}`}>
    <input ref={ref} type={type} {...props} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={description} onChange={(event) => onValueChange?.(event.currentTarget.value)} className={styles.input} />
    {feedback && <span id={feedbackId} className={styles.feedback} data-tone={tone}>
      <InfoTooltip label={`${tone} feedback`} tone={tone} mountWhenOpen>{feedback}</InfoTooltip>
      <span className={styles.feedbackText}>{feedback}</span>
    </span>}
  </span>
})
