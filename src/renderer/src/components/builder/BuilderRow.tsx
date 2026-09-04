import type { HTMLAttributes } from 'react'
import styles from './BuilderLayout.module.css'

export type BuilderRowProps = HTMLAttributes<HTMLDivElement>

export function BuilderRow({ className, ...props }: BuilderRowProps) {
  return <div className={[styles.row, className].filter(Boolean).join(' ')} {...props} />
}
