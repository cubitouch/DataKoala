import { useId } from 'react'
import type { ReactNode } from 'react'
import { InfoTooltip } from './InfoTooltip'
import styles from './FieldChrome.module.css'

export type FieldMode = 'normal' | 'inline'
export type LabelVisibility = 'visible' | 'sr-only'
export interface FieldFeedbackProps { hint?: string; warning?: string; error?: string | null }

interface Props extends FieldFeedbackProps {
  label: string
  mode?: FieldMode
  labelVisibility?: LabelVisibility
  id?: string
  describedBy?: string
  controlKind?: 'input' | 'button'
  children: (props: { controlId: string; labelId: string; describedBy?: string; invalid?: true }) => ReactNode
}

export function FieldChrome({ label, mode = 'normal', labelVisibility = 'visible', id, describedBy, controlKind = 'input', hint, warning, error, children }: Props) {
  const generated = useId()
  const controlId = id ?? `${generated}-control`
  const labelId = `${generated}-label`
  const feedback = error ?? warning ?? hint
  const tone = error ? 'error' : warning ? 'warning' : 'info'
  const feedbackId = feedback ? `${generated}-feedback` : undefined
  const descriptions = [describedBy, feedbackId].filter(Boolean).join(' ') || undefined
  return <span className={`${styles.field} ${styles[mode]}`}>
    <label id={labelId} htmlFor={controlKind === 'input' ? controlId : undefined} aria-label={controlKind === 'button' ? `${label}:` : undefined} className={labelVisibility === 'sr-only' ? styles.srOnly : styles.label}>{label}</label>
    <span className={styles.control}>{children({ controlId, labelId, describedBy: descriptions, invalid: error ? true : undefined })}</span>
    {feedback && <span id={feedbackId} className={styles.feedback} data-tone={tone}>
      <InfoTooltip label={label} tone={tone} mountWhenOpen>{feedback}</InfoTooltip>
      <span>{feedback}</span>
    </span>}
  </span>
}
