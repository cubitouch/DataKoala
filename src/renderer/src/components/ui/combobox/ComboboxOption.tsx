import styles from './Combobox.module.css'
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
  return <div id={id} role="option" aria-label={accessibleName} aria-selected={selected} aria-disabled={option.disabled || undefined} data-active={active || undefined} className={styles.option} onMouseEnter={onMouseEnter} onClick={() => { if (!option.disabled) onSelect() }}>
    {option.avatarUrl && <img className={styles.optionAvatar} src={option.avatarUrl} alt="" aria-hidden="true" />}
    {!option.avatarUrl && option.icon && <span className={styles.optionIcon} aria-hidden="true">{option.icon}</span>}
    <span className={styles.optionMain}>
      <span className={styles.optionLabel} data-combobox-option-label="" title={option.label}>{option.label}</span>
      {option.subtitle && <span className={styles.optionSubtitle} data-combobox-option-subtitle="" title={option.subtitle}>{option.subtitle}</span>}
    </span>
    <span className={styles.optionCheck} aria-hidden="true">{selected ? '✓' : ''}</span>
  </div>
}
