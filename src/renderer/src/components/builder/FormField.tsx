import type { HTMLAttributes } from 'react'
import styles from './BuilderLayout.module.css'

export type FormFieldProps = HTMLAttributes<HTMLDivElement>

export function FormField({ className, ...props }: FormFieldProps) {
  return <div className={[styles.field, className].filter(Boolean).join(' ')} {...props} />
}
