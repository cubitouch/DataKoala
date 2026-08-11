import React from 'react'
void React
import type { ComboboxOption as ComboboxOptionModel } from './types'

interface Props {
  option: ComboboxOptionModel
  id: string
  selected: boolean
  active: boolean
  onSelect: () => void
  onMouseEnter: () => void
}

export function ComboboxOption({ option, id, selected, active, onSelect, onMouseEnter }: Props) {
  const accessibleName = [option.label, option.subtitle].filter(Boolean).join(', ')
  return <div id={id} role="option" aria-label={accessibleName} aria-selected={selected} aria-disabled={option.disabled || undefined} data-active={active || undefined} className="combobox-option" onMouseEnter={onMouseEnter} onClick={() => { if (!option.disabled) onSelect() }}>
    {option.avatarUrl && <img className="combobox-option-avatar" src={option.avatarUrl} alt="" aria-hidden="true" />}
    {!option.avatarUrl && option.icon && <span className="combobox-option-icon" aria-hidden="true">{option.icon}</span>}
    <span className="combobox-option-main">
      <span className="combobox-option-label" title={option.label}>{option.label}</span>
      {option.subtitle && <span className="combobox-option-subtitle" title={option.subtitle}>{option.subtitle}</span>}
    </span>
    <span className="combobox-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
  </div>
}
