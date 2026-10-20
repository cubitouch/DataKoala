// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

const { copyTextToClipboard, codeMirrorProps } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
  codeMirrorProps: vi.fn(),
}))
vi.mock('@lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({
    value,
    ...props
  }: {
    value: string
    'aria-label'?: string
    height?: string
    basicSetup?: { lineNumbers?: boolean }
  }) => {
    codeMirrorProps(props)
    return <textarea aria-label={props['aria-label']} value={value} readOnly />
  },
}))

import { GeneratedQueryPanel } from './GeneratedQueryPanel'

describe('GeneratedQueryPanel', () => {
  beforeEach(() => {
    copyTextToClipboard.mockReset()
    codeMirrorProps.mockReset()
  })
  afterEach(cleanup)

  it('owns disclosure, preview, collapsed actions, supplementary content and open-in-editor behavior', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    const onOpenInEditor = vi.fn()
    const query = '{ resource.service.name = "checkout" }'

    render(
      <GeneratedQueryPanel
        language="TraceQL"
        value={query}
        onOpenInEditor={onOpenInEditor}
        supplementary={<span>Additional generated-query context</span>}
      />,
    )

    const details = screen
      .getByText('Generated TraceQL')
      .closest('details') as HTMLDetailsElement
    expect(details.hasAttribute('data-collapsible-section')).toBe(true)
    expect(
      screen
        .getByText('Generated TraceQL')
        .closest('[data-generated-query-panel]'),
    ).toBeTruthy()
    expect(details.open).toBe(false)

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy TraceQL to clipboard' }),
    )
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(query))
    expect(details.open).toBe(false)

    fireEvent.click(
      screen.getByRole('button', { name: 'Open in TraceQL mode' }),
    )
    expect(onOpenInEditor).toHaveBeenCalledOnce()
    expect(details.open).toBe(false)

    fireEvent.click(details.querySelector('summary') as HTMLElement)
    expect(details.open).toBe(true)
    expect(
      (screen.getByLabelText('Generated TraceQL query') as HTMLTextAreaElement)
        .value,
    ).toBe(query)
    expect(screen.getByText('Additional generated-query context')).toBeTruthy()
    expect(codeMirrorProps).toHaveBeenCalledWith(
      expect.objectContaining({
        height: '150px',
        basicSetup: expect.objectContaining({ lineNumbers: true }),
      }),
    )
  })

  it('renders validation and empty states and disables open without a query', () => {
    const { rerender } = render(
      <GeneratedQueryPanel
        language="PromQL"
        value=""
        validation="Choose a histogram representation."
        onOpenInEditor={vi.fn()}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain(
      'Choose a histogram representation.',
    )
    expect(
      screen
        .getByRole('button', { name: 'Open in PromQL mode' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Copy PromQL to clipboard' })
        .hasAttribute('disabled'),
    ).toBe(true)

    rerender(
      <GeneratedQueryPanel
        language="SQL"
        value=""
        emptyState="Select a table and X axis to preview SQL."
      />,
    )
    expect(
      screen.getByText('Select a table and X axis to preview SQL.'),
    ).toBeTruthy()
  })

  it('updates preview, copy and handoff labels across all query languages without changing query text', async () => {
    const onOpenInEditor = vi.fn()
    const cases = [
      ['SQL', 'select 42;'],
      ['PromQL', 'sum(rate(requests_total[5m]))'],
      ['LogQL', '{service_name="api"} |= "error"'],
      ['TraceQL', '{ span:duration > 300ms }'],
    ] as const
    const view = render(
      <GeneratedQueryPanel
        language="SQL"
        value="select 42;"
        onOpenInEditor={onOpenInEditor}
      />,
    )
    for (const [language, query] of cases) {
      view.rerender(
        <GeneratedQueryPanel
          language={language}
          value={query}
          onOpenInEditor={onOpenInEditor}
        />,
      )
      const details = screen
        .getByText('Generated ' + language)
        .closest('details')!
      if (!details.open) fireEvent.click(details.querySelector('summary')!)
      expect(
        (
          screen.getByLabelText(
            'Generated ' + language + ' query',
          ) as HTMLTextAreaElement
        ).value,
      ).toBe(query)
      const copy = screen.getByRole('button', {
        name: 'Copy ' + language + ' to clipboard',
      })
      copy.focus()
      expect(document.activeElement).toBe(copy)
      fireEvent.click(copy)
      await waitFor(() =>
        expect(copyTextToClipboard).toHaveBeenLastCalledWith(query),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'Open in ' + language + ' mode' }),
      )
      expect(details.open).toBe(true)
      expect(
        screen.getAllByRole('button', { name: /^Copy .* to clipboard$/ }),
      ).toHaveLength(1)
    }
    expect(onOpenInEditor).toHaveBeenCalledTimes(4)
  })
})
