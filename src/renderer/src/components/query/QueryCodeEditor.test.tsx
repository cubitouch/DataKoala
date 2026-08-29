import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryCodeEditor } from './QueryCodeEditor'

vi.mock('@uiw/react-codemirror', async () => {
  const React = await import('react')
  return { default: React.forwardRef(function Editor(props: Record<string, unknown>, _ref) {
    return <textarea aria-label={String(props['aria-label'])} aria-disabled={props['aria-disabled'] as boolean | undefined} value={String(props.value)} readOnly={props.editable === false} onChange={(event) => (props.onChange as (value: string) => void)(event.target.value)} onKeyDown={props.onKeyDown as React.KeyboardEventHandler<HTMLTextAreaElement>} data-extensions={(props.extensions as unknown[])?.length} />
  }) }
})

describe('QueryCodeEditor', () => {
  it('is controlled, forwards extensions, and handles the shared run shortcut', () => {
    const onChange = vi.fn(), onRun = vi.fn()
    render(<QueryCodeEditor value="up" onChange={onChange} extensions={[{} as never]} ariaLabel="PromQL editor" onRun={onRun} />)
    const editor = screen.getByRole('textbox', { name: 'PromQL editor' })
    fireEvent.change(editor, { target: { value: 'rate(up[5m])' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(onChange).toHaveBeenCalledWith('rate(up[5m])')
    expect(onRun).toHaveBeenCalledOnce()
    expect(editor).toHaveAttribute('data-extensions', '1')
  })

  it('presents disabled editors as non-editable', () => {
    render(<QueryCodeEditor value="{}" onChange={() => undefined} ariaLabel="TraceQL editor" disabled />)
    expect(screen.getByRole('textbox', { name: 'TraceQL editor' })).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: 'TraceQL editor' })).toHaveAttribute('aria-disabled', 'true')
  })
})
