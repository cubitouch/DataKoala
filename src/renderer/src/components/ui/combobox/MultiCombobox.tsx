import React from 'react'
void React
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Popover } from '../Popover'
import { FieldChrome } from '../FieldChrome'
import type { FieldFeedbackProps, FieldMode, LabelVisibility } from '../FieldChrome'
import { ComboboxOption as OptionRow } from './ComboboxOption'
import { ComboboxSearch } from './ComboboxSearch'
import { ComboboxTrigger } from './ComboboxTrigger'
import styles from './Combobox.module.css'
import type { ComboboxOption } from './types'

interface Props extends FieldFeedbackProps { id?: string; label: string; mode?: FieldMode; labelVisibility?: LabelVisibility; values: string[]; options: ComboboxOption[]; onChange: (values: string[]) => void; onOpen?: () => void; placeholder?: string; searchable?: boolean; showChips?: boolean; disabled?: boolean; loading?: boolean; loadingMessage?: string; emptyMessage?: string; invalidationKey?: unknown; allowCustomValue?: boolean }
const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
const optionText = (option: ComboboxOption) => norm([option.label, option.subtitle, ...(option.keywords ?? [])].filter(Boolean).join(' '))
const optionId = (prefix: string, value: string) => `${prefix}-option-${encodeURIComponent(value)}`

export function MultiCombobox({ id, label, mode, labelVisibility, hint, warning, values, options, onChange, onOpen, placeholder = 'Select options…', searchable = true, showChips = false, disabled = false, loading = false, error = null, loadingMessage = 'Loading…', emptyMessage = 'No matching options', invalidationKey, allowCustomValue = false }: Props) {
  const reactId = useId(); const menuId = `${reactId}-listbox`; const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [activeValue, setActiveValue] = useState<string | null>(null); const searchRef = useRef<HTMLInputElement>(null); const triggerRef = useRef<HTMLButtonElement>(null)
  const filtered = useMemo(() => { const q = norm(query); return q ? options.filter((option) => optionText(option).includes(q)) : options }, [options, query])
  const enabled = useMemo(() => filtered.filter((option) => !option.disabled), [filtered]); const active = filtered.find((option) => option.value === activeValue && !option.disabled) ?? enabled[0]
  const optionByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options])
  const selectedOptions = values.map((value) => optionByValue.get(value) ?? (allowCustomValue ? { value, label: value, subtitle: 'Manually entered' } : undefined)).filter((option): option is ComboboxOption => Boolean(option))
  useEffect(() => { if (!open) { setQuery(''); setActiveValue(null); return }; setActiveValue((current) => filtered.some((option) => option.value === current && !option.disabled) ? current : (enabled[0]?.value ?? null)) }, [open, filtered, enabled])
  useEffect(() => { if (open) onOpen?.(); if (open && searchable) searchRef.current?.focus() }, [open, searchable, onOpen])
  useEffect(() => { if (active) document.getElementById(optionId(reactId, active.value))?.scrollIntoView({ block: 'nearest' }) }, [active?.value, reactId])
  const toggle = (option = active) => { if (!option || option.disabled) return; onChange(values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value]) }
  const remove = (value: string) => onChange(values.filter((existing) => existing !== value))
  const move = (direction: 1 | -1) => { if (!enabled.length) return; const index = active ? enabled.findIndex((option) => option.value === active.value) : -1; setActiveValue(enabled[(index + direction + enabled.length) % enabled.length].value) }
  const onKeyDown = (event: React.KeyboardEvent) => { if (event.key === 'ArrowDown') { event.preventDefault(); move(1) } else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) } else if (event.key === 'Home') { event.preventDefault(); setActiveValue(enabled[0]?.value ?? null) } else if (event.key === 'End') { event.preventDefault(); setActiveValue(enabled.at(-1)?.value ?? null) } else if (event.key === 'Enter' || (!searchable && event.key === ' ')) { event.preventDefault(); if (allowCustomValue && query.trim() && !options.some((option) => option.value === query.trim())) commitCustom(); else toggle() } else if (event.key === 'Escape' || event.key === 'Tab') setOpen(false); else if (event.key === 'Backspace' && searchable && query === '' && values.length) remove(values.at(-1)!) }
  const clearAll = () => onChange([])
  const commitCustom = () => { const custom = query.trim(); if (custom && !values.includes(custom)) onChange([...values, custom]); setQuery('') }
  const triggerSummary = selectedOptions.length ? { value: 'summary', label: `${selectedOptions.length} selected` } : undefined
  return <FieldChrome label={label} mode={mode} labelVisibility={labelVisibility} id={id} controlKind="button" hint={hint} warning={warning} error={error}>
  {({ controlId, labelId, describedBy, invalid }) => <><span id={`${controlId}-value`} className={styles.srOnly}>{selectedOptions.map((option) => option.label).join(', ') || placeholder}</span><Popover triggerRef={triggerRef} contentClassName={styles.menu} maxHeight={360} open={open} onOpenChange={setOpen} disabled={disabled} invalidationKey={invalidationKey} ariaLabel={`${label}: ${selectedOptions.map((o) => o.label).join(', ') || placeholder}`} popupType="listbox" focusOptionsOnKeyboardOpen={false} triggerButtonProps={{ id: controlId, role: 'combobox', 'aria-labelledby': `${labelId} ${controlId}-value`, 'aria-describedby': describedBy, 'aria-invalid': invalid, 'aria-controls': menuId, 'aria-activedescendant': active ? optionId(reactId, active.value) : undefined, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); return } if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveValue((event.key === 'ArrowDown' ? enabled[0] : enabled.at(-1))?.value ?? null) } } }} trigger={<ComboboxTrigger selected={triggerSummary} chips={showChips ? selectedOptions : undefined} onRemoveChip={remove} placeholder={placeholder} />}>
    <div id={menuId} role="listbox" aria-label={label} aria-multiselectable="true" aria-busy={loading || undefined} aria-activedescendant={active ? optionId(reactId, active.value) : undefined} onKeyDown={onKeyDown} tabIndex={searchable ? -1 : 0}>
      {searchable && <ComboboxSearch inputRef={searchRef} value={query} onChange={setQuery} onKeyDown={onKeyDown} label={label} />}
      {values.length > 0 && <button type="button" className={styles.clear} onClick={clearAll}>Clear all</button>}
      {loading && <div className={styles.state} role="status">{loadingMessage}</div>}
      {error && <div className={styles.state} role="alert">{error}</div>}
      {allowCustomValue && query.trim() && !options.some((option) => option.value === query.trim()) && <button type="button" className={styles.custom} onClick={commitCustom}>Use “{query.trim()}”</button>}
      {!loading && !error && filtered.map((option) => <OptionRow key={option.value} id={optionId(reactId, option.value)} option={option} selected={values.includes(option.value)} active={option.value === active?.value} onMouseEnter={() => { if (!option.disabled) setActiveValue(option.value) }} onSelect={() => toggle(option)} />)}
      {!loading && !error && filtered.length === 0 && <div className={styles.state} role="status">{emptyMessage}</div>}
    </div>
  </Popover></>}
  </FieldChrome>
}
