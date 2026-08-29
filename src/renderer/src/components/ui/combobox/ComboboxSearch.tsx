import type { KeyboardEventHandler, RefObject } from 'react'
import { InputControl } from '../input/InputControl'
import styles from './Combobox.module.css'
interface Props {
  value: string
  onChange: (value: string) => void
  onKeyDown: KeyboardEventHandler<HTMLInputElement>
  inputRef: RefObject<HTMLInputElement | null>
  label: string
}

export function ComboboxSearch({ value, onChange, onKeyDown, inputRef, label }: Props) {
  return <div className={styles.searchWrap} data-combobox-search=""><span aria-hidden="true">⌕</span><InputControl appearance="embedded" aria-label={`Search ${label}`} ref={inputRef} placeholder="Search" value={value} onValueChange={onChange} onKeyDown={onKeyDown} /></div>
}
