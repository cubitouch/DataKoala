import React from 'react'
void React
import { TextInput } from '../TextInput'
import styles from './Combobox.module.css'
interface Props {
  value: string
  onChange: (value: string) => void
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>
  inputRef: React.RefObject<HTMLInputElement | null>
  label: string
}

export function ComboboxSearch({ value, onChange, onKeyDown, inputRef, label }: Props) {
  return <div className={styles.searchWrap}><span aria-hidden="true">⌕</span><TextInput label={`Search ${label}`} labelVisibility="sr-only" mode="inline" ref={inputRef} placeholder="Search" value={value} onValueChange={onChange} onKeyDown={onKeyDown} /></div>
}
