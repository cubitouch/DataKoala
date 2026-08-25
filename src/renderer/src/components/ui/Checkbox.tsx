import type { InputHTMLAttributes } from 'react'
import styles from './Checkbox.module.css'

interface CheckboxProps extends Pick<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'disabled' | 'aria-describedby' | 'id'> {
  label: string
  onCheckedChange: (checked: boolean) => void
  className?: string
}

export function Checkbox({ label, onCheckedChange, className, ...props }: CheckboxProps) {
  return <label className={`${styles.root}${className ? ` ${className}` : ''}`}><input {...props} type="checkbox" onChange={(event) => onCheckedChange(event.currentTarget.checked)} /><span>{label}</span></label>
}
