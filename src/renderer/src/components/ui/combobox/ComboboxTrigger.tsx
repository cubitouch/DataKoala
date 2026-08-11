import React from 'react'
void React
import type { ComboboxOption } from './types'

interface Props {
  selected?: ComboboxOption
  placeholder: string
  loading?: boolean
  error?: string | null
  showSubtitle?: boolean
  chips?: ComboboxOption[]
  onRemoveChip?: (value: string) => void
}

export function ComboboxTrigger({ selected, placeholder, loading, error, showSubtitle, chips, onRemoveChip }: Props) {
  return <>
    <span className="combobox-trigger-content">
      {chips?.length ? <span className="combobox-chips">{chips.map((chip) => <span className="combobox-chip" key={chip.value} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemoveChip?.(chip.value) }}>{chip.avatarUrl && <img src={chip.avatarUrl} alt="" aria-hidden="true" />}<span className="combobox-chip-label">{chip.label}</span><span className="combobox-chip-remove" aria-hidden="true">×</span></span>)}</span> : <>
        {selected?.avatarUrl && <img className="combobox-trigger-avatar" src={selected.avatarUrl} alt="" aria-hidden="true" />}
        {!selected?.avatarUrl && selected?.icon && <span className="combobox-trigger-icon" aria-hidden="true">{selected.icon}</span>}
        <span className={`combobox-trigger-text ${selected ? '' : 'placeholder'}`}>
          <span className="combobox-trigger-label">{selected?.label ?? placeholder}</span>
          {showSubtitle && selected?.subtitle && <span className="combobox-trigger-subtitle">{selected.subtitle}</span>}
        </span>
      </>}
    </span>
    {loading && <span className="spinner" aria-hidden="true"></span>}
    {error && <span className="combobox-error-dot" aria-hidden="true">!</span>}
    <span className="select-chevron" aria-hidden="true"></span>
  </>
}
