import { useId, useState } from 'react'

export function InfoTooltip({ label, children }: { label: string; children: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return <span className="info-tooltip">
    <button type="button" className="info-tooltip-trigger" aria-label={`${label} help`} aria-describedby={id} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>i</button>
    <span id={id} role="tooltip" className="info-tooltip-content" hidden={!open}>{children}</span>
  </span>
}
