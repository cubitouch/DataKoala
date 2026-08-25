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

interface Props extends FieldFeedbackProps {
  id?: string
  label: string
  mode?: FieldMode
  labelVisibility?: LabelVisibility
  value: string
  options: ComboboxOption[]
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  loading?: boolean
  emptyMessage?: string
  loadingMessage?: string
  invalidationKey?: unknown
  allowCustomValue?: boolean
}

const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
const optionId = (prefix: string, value: string) => `${prefix}-option-${encodeURIComponent(value)}`
const optionText = (option: ComboboxOption) => norm([option.label, option.subtitle, ...(option.keywords ?? [])].filter(Boolean).join(' '))
const isTypingKey = (event: React.KeyboardEvent) => event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey

export function Combobox({ id, label, mode, labelVisibility, hint, warning, value, options, onChange, placeholder = 'Select an option…', searchable = false, disabled = false, loading = false, error = null, emptyMessage = 'No matching options', loadingMessage = 'Loading…', invalidationKey, allowCustomValue = false }: Props) {
  const reactId = useId()
  const menuId = `${reactId}-listbox`
  const selected = options.find((option) => option.value === value) ?? (allowCustomValue && value ? { value, label: value, subtitle: 'Manually entered' } : undefined)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeValue, setActiveValue] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef('')
  const typeaheadTime = useRef(0)
  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return options
    return options.filter((option) => optionText(option).includes(q))
  }, [options, query])
  const enabled = useMemo(() => filtered.filter((option) => !option.disabled), [filtered])
  const active = filtered.find((option) => option.value === activeValue && !option.disabled) ?? enabled[0]

  useEffect(() => {
    if (!open) { setQuery(''); setActiveValue(null); return }
    setActiveValue((current) => filtered.some((option) => option.value === current && !option.disabled) ? current : (enabled[0]?.value ?? null))
  }, [open, filtered, enabled])
  useEffect(() => { if (open && searchable) searchRef.current?.focus() }, [open, searchable])
  useEffect(() => {
    if (!active?.value) return
    document.getElementById(optionId(reactId, active.value))?.scrollIntoView({ block: 'nearest' })
  }, [active?.value, reactId])

  const move = (direction: 1 | -1) => {
    if (!enabled.length) return
    const index = active ? enabled.findIndex((option) => option.value === active.value) : -1
    setActiveValue(enabled[(index + direction + enabled.length) % enabled.length].value)
  }
  const commitCustom = () => { const custom = query.trim(); if (!custom) return; onChange(custom); setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()) }
  const commit = (option = active) => {
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
    if (event.key === 'Home') { event.preventDefault(); setActiveValue(enabled[0]?.value ?? null); return }
    if (event.key === 'End') { event.preventDefault(); setActiveValue(enabled.at(-1)?.value ?? null); return }
    if (event.key === 'Enter' || (!searchable && event.key === ' ')) { event.preventDefault(); if (allowCustomValue && query.trim() && !filtered.some((option) => option.value === query.trim())) commitCustom(); else commit(); return }
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (!searchable && isTypingKey(event)) {
      const now = Date.now(); typeahead.current = now - typeaheadTime.current > 650 ? event.key : typeahead.current + event.key; typeaheadTime.current = now
      const start = active ? enabled.findIndex((option) => option.value === active.value) : -1
      const ordered = [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)]
      const found = ordered.find((option) => norm(option.label).startsWith(norm(typeahead.current)))
      if (found) setActiveValue(found.value)
    }
  }
  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveValue((event.key === 'ArrowDown' ? enabled[0] : enabled.at(-1))?.value ?? null); return }
    if (event.key === 'Escape') { setOpen(false); return }
    if (searchable && isTypingKey(event)) { event.preventDefault(); setOpen(true); setQuery(event.key) }
  }

  return <FieldChrome label={label} mode={mode} labelVisibility={labelVisibility} id={id} controlKind="button" hint={hint} warning={warning} error={error}>
  {({ controlId, labelId, describedBy, invalid }) => <><span id={`${controlId}-value`} className={styles.srOnly}>{selected?.label ?? placeholder}</span><Popover triggerRef={triggerRef} contentClassName={styles.menu} triggerClassName={error ? styles.errorTrigger : undefined} maxHeight={360} open={open} onOpenChange={setOpen} disabled={disabled} invalidationKey={invalidationKey} ariaLabel={`${label}: ${selected?.label ?? placeholder}`} popupType="listbox" focusOptionsOnKeyboardOpen={false} triggerButtonProps={{ id: controlId, value, role: 'combobox', 'aria-labelledby': `${labelId} ${controlId}-value`, 'aria-describedby': describedBy, 'aria-invalid': invalid, 'aria-controls': menuId, 'aria-activedescendant': active ? optionId(reactId, active.value) : undefined, onKeyDown: onTriggerKeyDown }} trigger={<ComboboxTrigger selected={selected} placeholder={placeholder} loading={loading} error={error} />}>
    <div ref={menuRef} id={menuId} role="listbox" aria-label={label} aria-busy={loading || undefined} aria-activedescendant={active ? optionId(reactId, active.value) : undefined} onKeyDown={onMenuKeyDown} tabIndex={searchable ? -1 : 0}>
      {searchable && <ComboboxSearch inputRef={searchRef} value={query} onChange={setQuery} onKeyDown={onMenuKeyDown} label={label} />}
      {loading && <div className={styles.state} role="status">{loadingMessage}</div>}
      {error && <div className={`${styles.state} ${styles.errorState}`} role="alert">{error}</div>}
      {allowCustomValue && query.trim() && !options.some((option) => option.value === query.trim()) && <button type="button" className={styles.custom} onClick={commitCustom}>Use “{query.trim()}”</button>}
      {!loading && !error && filtered.map((option) => <OptionRow key={option.value} id={optionId(reactId, option.value)} option={option} selected={option.value === value} active={option.value === active?.value} onMouseEnter={() => { if (!option.disabled) setActiveValue(option.value) }} onSelect={() => commit(option)} />)}
      {!loading && !error && filtered.length === 0 && <div className={styles.state} role="status">{emptyMessage}</div>}
    </div>
  </Popover></>}
  </FieldChrome>
}
