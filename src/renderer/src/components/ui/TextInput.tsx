import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { FieldChrome } from './FieldChrome'
import type { FieldFeedbackProps, FieldMode, LabelVisibility } from './FieldChrome'
import styles from './TextInput.module.css'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'type'>, FieldFeedbackProps {
  label: string
  mode?: FieldMode
  labelVisibility?: LabelVisibility
  type?: 'text' | 'search' | 'password' | 'number' | 'time'
  onValueChange?: (value: string) => void
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ label, mode, labelVisibility, id, type = 'text', hint, warning, error, onValueChange, 'aria-describedby': describedBy, ...props }, ref) {
  return <FieldChrome label={label} mode={mode} labelVisibility={labelVisibility} id={id} describedBy={describedBy} hint={hint} warning={warning} error={error}>
    {({ controlId, describedBy: description, invalid }) => <input ref={ref} id={controlId} type={type} {...props} aria-invalid={invalid ?? props['aria-invalid']} aria-describedby={description} onChange={(event) => onValueChange?.(event.currentTarget.value)} className={styles.input} />}
  </FieldChrome>
})
