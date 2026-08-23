import React from 'react'
void React
import styles from './Combobox.module.css'
interface Props {
  value: string
  onChange: (value: string) => void
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>
  inputRef: React.RefObject<HTMLInputElement | null>
  label: string
}

export function ComboboxSearch({ value, onChange, onKeyDown, inputRef, label }: Props) {
  return <div className={styles.searchWrap}><span aria-hidden="true">⌕</span><input ref={inputRef} className={styles.search} aria-label={`Search ${label}`} placeholder="Search" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} /></div>
}
