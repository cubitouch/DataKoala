import { createRef, forwardRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Extension } from '@codemirror/state'
import type { QueryCodeEditorHandle } from './QueryCodeEditor'

const captured: { props?: Record<string, unknown>; dispatch?: ReturnType<typeof vi.fn>; focus?: ReturnType<typeof vi.fn> } = {}
vi.mock('@uiw/react-codemirror', () => ({
  default: forwardRef((props: Record<string, unknown>, ref) => {
    captured.props = props
    captured.dispatch = vi.fn()
    captured.focus = vi.fn()
    const view = { state: { selection: { main: { anchor: 8, head: 2 } }, doc: { length: 12 } }, dispatch: captured.dispatch, focus: captured.focus }
    if (typeof ref === 'function') ref({ view })
    else if (ref) ref.current = { view }
    return <textarea aria-label={props['aria-label'] as string} placeholder={props.placeholder as string} value={props.value as string} onChange={(event) => (props.onChange as (value: string) => void)(event.target.value)} />
  })
}))

import { QueryCodeEditor } from './QueryCodeEditor'

describe('QueryCodeEditor', () => {
  it('renders controlled content and forwards changes, extensions, and accessibility props', () => {
    const onChange = vi.fn(), extensions = [{} as Extension]
    render(<QueryCodeEditor value="up" onChange={onChange} extensions={extensions} aria-label="PromQL editor" placeholder="metric" />)
    const editor = screen.getByLabelText('PromQL editor')
    expect((editor as HTMLTextAreaElement).value).toBe('up')
    expect(editor.getAttribute('placeholder')).toBe('metric')
    fireEvent.change(editor, { target: { value: 'down' } })
    expect(onChange).toHaveBeenCalledWith('down')
    expect(captured.props?.extensions).toBe(extensions)
  })

  it('replaces content, caps the selection, and restores focus through its narrow ref API', () => {
    const ref = createRef<QueryCodeEditorHandle>()
    render(<QueryCodeEditor ref={ref} value="long content" onChange={() => {}} extensions={[]} aria-label="SQL editor" />)
    expect(ref.current?.replaceDocumentAndFocus('sql')).toBe(true)
    expect(captured.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: { from: 0, to: 12, insert: 'sql' }, selection: { anchor: 3, head: 2 }, userEvent: 'input.format'
    }))
    expect(captured.focus).toHaveBeenCalled()
  })
})
