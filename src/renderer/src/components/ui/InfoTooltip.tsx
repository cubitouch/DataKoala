import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './InfoTooltip.module.css'

interface Position { left: number; top: number; maxWidth: number }

export function InfoTooltip({ label, children }: { label: string; children: string }) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position>({ left: 8, top: 8, maxWidth: 320 })
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const gutter = 8
      const width = Math.min(320, Math.max(180, window.innerWidth - gutter * 2))
      const height = tooltipRef.current?.getBoundingClientRect().height ?? 70
      const left = Math.min(Math.max(gutter, trigger.left + trigger.width / 2 - width / 2), window.innerWidth - width - gutter)
      const below = trigger.bottom + gutter
      const top = below + height <= window.innerHeight - gutter ? below : Math.max(gutter, trigger.top - height - gutter)
      setPosition({ left, top, maxWidth: width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  const tooltip = <span ref={tooltipRef} id={id} role="tooltip" className={styles.content} style={{ left: position.left, top: position.top, maxWidth: position.maxWidth }} hidden={!open}>{children}</span>
  return <span className={styles.root}>
    <button ref={triggerRef} type="button" className={styles.trigger} aria-label={`${label} help`} aria-describedby={id} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>i</button>
    {typeof document === 'undefined' ? tooltip : createPortal(tooltip, document.body)}
  </span>
}
