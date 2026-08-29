import { forwardRef, type KeyboardEvent } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'

export interface QueryCodeEditorProps {
  value: string
  onChange: (value: string) => void
  extensions?: readonly Extension[]
  ariaLabel: string
  placeholder?: string
  height?: string
  minHeight?: string
  maxHeight?: string
  editable?: boolean
  disabled?: boolean
  onRun?: () => void
}

/** Controlled, datasource-neutral presentation for every editable query surface. */
export const QueryCodeEditor = forwardRef<ReactCodeMirrorRef, QueryCodeEditorProps>(function QueryCodeEditor({
  value,
  onChange,
  extensions = [],
  ariaLabel,
  placeholder,
  height,
  minHeight,
  maxHeight,
  editable = true,
  disabled = false,
  onRun
}, ref) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (onRun && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onRun()
    }
  }

  return <CodeMirror
    ref={ref}
    value={value}
    height={height}
    minHeight={minHeight}
    maxHeight={maxHeight}
    theme={oneDark}
    extensions={[...extensions]}
    onChange={onChange}
    editable={editable && !disabled}
    aria-disabled={disabled || undefined}
    aria-label={ariaLabel}
    placeholder={placeholder}
    onKeyDown={onKeyDown}
    basicSetup={{ lineNumbers: true, foldGutter: false }}
  />
})
