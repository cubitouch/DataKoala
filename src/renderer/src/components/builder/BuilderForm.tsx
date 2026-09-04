import type { HTMLAttributes, ReactNode } from 'react'
import styles from './BuilderLayout.module.css'

export type BuilderFormProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section'
  children: ReactNode
}

export function BuilderForm({ as: Element = 'div', className, ...props }: BuilderFormProps) {
  return <Element className={[styles.form, className].filter(Boolean).join(' ')} {...props} />
}
