import { forwardRef, useImperativeHandle, useRef, type KeyboardEventHandler } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import styles from './QueryCodeEditor.module.css'

export interface QueryCodeEditorHandle {
  /** Replaces the document while retaining a capped selection and editor focus. */
  replaceDocumentAndFocus(value: string): boolean
  focus(): void
}

export interface QueryCodeEditorProps {
  value: string
  onChange: (value: string) => void
  extensions: Extension[]
  'aria-label': string
  placeholder?: string
  className?: string
  height?: string
  minHeight?: string
  maxHeight?: string
  editable?: boolean
  lineNumbers?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

/** The controlled CodeMirror surface shared by every standard editable query path. */
export const QueryCodeEditor = forwardRef<QueryCodeEditorHandle, QueryCodeEditorProps>(function QueryCodeEditor({
  value, onChange, extensions, className, height, minHeight, maxHeight, editable = true, lineNumbers = true,
  onKeyDown, ...accessibleProps
}, forwardedRef) {
  const codeMirrorRef = useRef<ReactCodeMirrorRef>(null)

  useImperativeHandle(forwardedRef, () => ({
    replaceDocumentAndFocus(nextValue) {
      const view = codeMirrorRef.current?.view
      if (!view) return false
      const anchor = Math.min(view.state.selection.main.anchor, nextValue.length)
      const head = Math.min(view.state.selection.main.head, nextValue.length)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextValue }, selection: { anchor, head }, userEvent: 'input.format' })
      view.focus()
      return true
    },
    focus() { codeMirrorRef.current?.view?.focus() }
  }), [])

  return <div className={`${styles.editor}${className ? ` ${className}` : ''}`} onKeyDown={onKeyDown}>
    <CodeMirror ref={codeMirrorRef} value={value} height={height} minHeight={minHeight} maxHeight={maxHeight} theme={oneDark} extensions={extensions} onChange={onChange} editable={editable} basicSetup={{ lineNumbers, foldGutter: false }} {...accessibleProps} />
  </div>
})
