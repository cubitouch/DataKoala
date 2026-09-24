import { PopoverChevron } from '../Popover'
import styles from './Combobox.module.css'
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
    <span className={styles.triggerContent}>
      {chips?.length ? <span className={styles.chips}>{chips.map((chip) => <span className={styles.chip} data-combobox-chip="" key={chip.value} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemoveChip?.(chip.value) }}>{chip.avatarUrl && <img src={chip.avatarUrl} alt="" aria-hidden="true" />}<span className={styles.chipLabel}>{chip.label}</span><span className={styles.chipRemove} aria-hidden="true">×</span></span>)}</span> : <>
        {selected?.avatarUrl && <img className={styles.triggerAvatar} src={selected.avatarUrl} alt="" aria-hidden="true" />}
        {!selected?.avatarUrl && selected?.icon && <span className={styles.triggerIcon} aria-hidden="true">{selected.icon}</span>}
        <span className={[styles.triggerText, selected ? '' : styles.placeholder].filter(Boolean).join(' ')}>
          <span className={styles.triggerLabel}>{selected?.label ?? placeholder}</span>
          {showSubtitle && selected?.subtitle && <span className={styles.triggerSubtitle}>{selected.subtitle}</span>}
        </span>
      </>}
    </span>
    {loading && <span className="spinner" aria-hidden="true"></span>}
    {error && <span className={styles.errorDot} aria-hidden="true">!</span>}
    <PopoverChevron />
  </>
}
