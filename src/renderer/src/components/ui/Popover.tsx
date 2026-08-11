import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type AriaAttributes, type AriaRole, type KeyboardEvent, type ReactNode, type ButtonHTMLAttributes, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export type CloseReason = 'outside' | 'escape' | 'toggle' | 'coordination' | 'invalidated' | 'disabled'
type OverlaySubscriber = (id: string) => void

// A tiny application-wide coordinator. Popovers remain independent of application state,
// while opening one reliably dismisses every other instance.
const overlayCoordinator = (() => {
  const subscribers = new Set<OverlaySubscriber>()
  return {
    open(id: string) { subscribers.forEach((subscriber) => subscriber(id)) },
    subscribe(subscriber: OverlaySubscriber) { subscribers.add(subscriber); return () => { subscribers.delete(subscriber) } }
  }
})()

interface PopoverContextValue { close: (reason?: CloseReason) => void }
const PopoverContext = createContext<PopoverContextValue | null>(null)
export const usePopover = () => useContext(PopoverContext)

export interface PopoverProps {
  trigger: ReactNode
  children: ReactNode
  ariaLabel: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, reason?: CloseReason) => void
  disabled?: boolean
  invalidationKey?: unknown
  className?: string
  contentClassName?: string
  maxHeight?: number
  focusOptionsOnKeyboardOpen?: boolean
  popupType?: AriaAttributes['aria-haspopup']
  contentRole?: AriaRole
  triggerButtonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'disabled' | 'onClick' | 'onPointerDown'>
  triggerRef?: RefObject<HTMLButtonElement>
}

export function Popover({ trigger, children, ariaLabel, open: controlledOpen, defaultOpen = false, onOpenChange, disabled = false, invalidationKey, className = '', contentClassName = '', maxHeight = 280, focusOptionsOnKeyboardOpen = true, popupType, contentRole, triggerButtonProps, triggerRef: externalTriggerRef }: PopoverProps) {
  const id = useId()
  const internalTriggerRef = useRef<HTMLButtonElement>(null)
  const triggerRef = externalTriggerRef ?? internalTriggerRef
  const contentRef = useRef<HTMLDivElement>(null)
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' })
  const keyboardOpen = useRef(false)
  const isOpen = controlledOpen ?? internalOpen

  const changeOpen = useCallback((next: boolean, reason?: CloseReason) => {
    if (controlledOpen === undefined) setInternalOpen(next)
    onOpenChange?.(next, reason)
  }, [controlledOpen, onOpenChange])
  const close = useCallback((reason: CloseReason = 'toggle') => changeOpen(false, reason), [changeOpen])
  const focusNearTrigger = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const focusable = Array.from(document.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !contentRef.current?.contains(element) && element !== trigger)
    const triggerRect = trigger.getBoundingClientRect()
    const nearest = focusable.reduce<HTMLElement | null>((best, element) => {
      if (!best) return element
      const distance = Math.abs(element.getBoundingClientRect().top - triggerRect.top) + Math.abs(element.getBoundingClientRect().left - triggerRect.left)
      const bestDistance = Math.abs(best.getBoundingClientRect().top - triggerRect.top) + Math.abs(best.getBoundingClientRect().left - triggerRect.left)
      return distance < bestDistance ? element : best
    }, null)
    ;(nearest ?? document.body).focus()
  }, [])

  const position = useCallback(() => {
    const anchor = triggerRef.current
    const floating = contentRef.current
    if (!anchor || !floating) return
    const gap = 6, margin = 8
    const rect = anchor.getBoundingClientRect()
    const availableBelow = window.innerHeight - rect.bottom - gap - margin
    const availableAbove = rect.top - gap - margin
    const placeAbove = availableBelow < Math.min(maxHeight, 180) && availableAbove > availableBelow
    const available = Math.max(80, placeAbove ? availableAbove : availableBelow)
    const height = Math.min(maxHeight, available)
    const preferredWidth = contentClassName.includes('custom-time-range-content') ? 760 : Math.max(rect.width, 220)
    const width = Math.min(preferredWidth, window.innerWidth - margin * 2)
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
    setStyle({ position: 'fixed', left, top: placeAbove ? undefined : rect.bottom + gap, bottom: placeAbove ? window.innerHeight - rect.top + gap : undefined, width, maxHeight: height, visibility: 'visible' })
  }, [maxHeight])

  useLayoutEffect(() => { if (isOpen) position() }, [isOpen, position, children])
  useEffect(() => {
    if (!isOpen) return
    const onOtherOpen = (otherId: string) => { if (otherId !== id) close('coordination') }
    return overlayCoordinator.subscribe(onOtherOpen)
  }, [close, id, isOpen])
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return
      close('outside')
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); close('escape'); triggerRef.current?.focus()
    }
    const onResize = () => position()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [close, isOpen, position])
  useEffect(() => { if (disabled && isOpen) { focusNearTrigger(); close('disabled') } }, [close, disabled, focusNearTrigger, isOpen])
  const previousInvalidation = useRef(invalidationKey)
  useEffect(() => {
    if (!Object.is(previousInvalidation.current, invalidationKey)) {
      previousInvalidation.current = invalidationKey
      if (isOpen) { close('invalidated'); if (!disabled) triggerRef.current?.focus() }
    }
  }, [close, disabled, invalidationKey, isOpen])
  useEffect(() => {
    if (!isOpen || !keyboardOpen.current || !focusOptionsOnKeyboardOpen) return
    const option = contentRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]:not([aria-disabled="true"])')
      ?? contentRef.current?.querySelector<HTMLElement>('[role="option"]:not([aria-disabled="true"])')
    option?.focus()
  }, [focusOptionsOnKeyboardOpen, isOpen])

  const toggle = (fromKeyboard: boolean) => {
    if (disabled) return
    if (isOpen) { close('toggle'); return }
    keyboardOpen.current = fromKeyboard
    overlayCoordinator.open(id)
    changeOpen(true)
  }
  return <div className={`popover ${className}`}>
    <button ref={triggerRef} type="button" className="popover-trigger" aria-label={ariaLabel} aria-haspopup={popupType} aria-expanded={isOpen} aria-controls={isOpen ? `${id}-content` : undefined} disabled={disabled} {...triggerButtonProps}
      onPointerDown={() => { keyboardOpen.current = false }} onClick={(event) => toggle(event.detail === 0)}>
      {trigger}
    </button>
    {isOpen && createPortal(<PopoverContext.Provider value={{ close }}><div ref={contentRef} id={`${id}-content`} role={contentRole} aria-label={contentRole ? ariaLabel : undefined} className={`popover-content ${contentClassName}`} style={style}>{children}</div></PopoverContext.Provider>, document.body)}
  </div>
}

export interface MultiSelectOption { value: string; label: string; detail?: string; disabled?: boolean }
interface MultiSelectProps {
  label: string
  options: MultiSelectOption[]
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  invalidationKey?: unknown
  emptySummary?: string
}

export function MultiSelect({ label, options, values, onChange, disabled, invalidationKey, emptySummary = 'No series' }: MultiSelectProps) {
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const enabledIndexes = useMemo(() => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0), [options])
  const preferredIndex = options.findIndex((option) => !option.disabled && values.includes(option.value))
  const [activeIndex, setActiveIndex] = useState(() => preferredIndex >= 0 ? preferredIndex : (enabledIndexes[0] ?? -1))
  const typeahead = useRef('')
  const typeaheadTime = useRef(0)
  const summary = values.length ? `${values.length} selected` : emptySummary
  useEffect(() => {
    if (activeIndex >= 0 && options[activeIndex] && !options[activeIndex].disabled) return
    setActiveIndex(preferredIndex >= 0 ? preferredIndex : (enabledIndexes[0] ?? -1))
  }, [activeIndex, options, preferredIndex, enabledIndexes])
  const focus = (index: number) => {
    if (index < 0 || options[index]?.disabled) return
    setActiveIndex(index)
    optionRefs.current[index]?.focus()
  }
  const move = (current: number, direction: number) => {
    if (!enabledIndexes.length) return
    const position = enabledIndexes.indexOf(current)
    const nextPosition = position < 0 ? (direction > 0 ? 0 : enabledIndexes.length - 1) : (position + direction + enabledIndexes.length) % enabledIndexes.length
    const next = enabledIndexes[nextPosition]
    setActiveIndex(next)
    optionRefs.current[next]?.focus()
  }
  const onOptionKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(index, event.key === 'ArrowDown' ? 1 : -1); return }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focus(event.key === 'Home' ? (enabledIndexes[0] ?? -1) : (enabledIndexes.at(-1) ?? -1)); return }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); optionRefs.current[index]?.click(); return }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const now = Date.now(); typeahead.current = now - typeaheadTime.current > 600 ? event.key : typeahead.current + event.key; typeaheadTime.current = now
      if (!enabledIndexes.length) return
      const start = enabledIndexes.indexOf(activeIndex)
      const ordered = [...enabledIndexes.slice(start + 1), ...enabledIndexes.slice(0, start + 1)]
      const found = ordered.find((optionIndex) => options[optionIndex].label.toLowerCase().startsWith(typeahead.current.toLowerCase()))
      if (found !== undefined) focus(found)
    }
  }
  return <Popover className="multi-select" trigger={<><span className="multi-select-summary">{summary}</span><span className="select-chevron" aria-hidden="true"></span></>} ariaLabel={`${label}: ${summary}. Selected: ${values.join(', ') || 'none'}`} disabled={disabled} invalidationKey={invalidationKey} popupType="listbox" contentClassName="multi-select-menu">
    <div role="listbox" aria-label={label} aria-multiselectable="true">
      {options.map((option, index) => {
        const selected = values.includes(option.value)
        return <div key={option.value} ref={(node) => { optionRefs.current[index] = node }} role="option" aria-selected={selected} aria-disabled={option.disabled || undefined} tabIndex={!option.disabled && activeIndex === index ? 0 : -1} className="multi-select-option"
          onFocus={() => { if (!option.disabled) setActiveIndex(index) }}
          onKeyDown={(event) => onOptionKeyDown(event, index)} onClick={() => { if (!option.disabled) onChange(selected ? values.filter((value) => value !== option.value) : [...values, option.value]) }}>
          <input type="checkbox" tabIndex={-1} aria-hidden="true" checked={selected} readOnly />
          <span className="multi-select-option-text"><span className="multi-select-option-name">{option.label}</span>{option.detail && <small>{option.detail}</small>}</span>
        </div>
      })}
      {!options.length && <div className="popover-empty">No available columns</div>}
    </div>
  </Popover>
}
