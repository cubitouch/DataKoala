import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { copyTextToClipboard } = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }))
vi.mock('@lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, ...props }: { value: string; 'aria-label'?: string }) => <textarea aria-label={props['aria-label']} value={value} readOnly />
}))
vi.mock('@components/ui/combobox', () => ({
  Combobox: ({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string }>; onChange?: (value: string) => void }) => <button type="button" aria-label={`${label}: ${value}`} onClick={() => onChange?.(options[(options.findIndex((option) => option.value === value) + 1) % options.length].value)}>{value}</button>,
  MultiCombobox: ({ label, values, options, onChange }: { label: string; values: string[]; options: Array<{ value: string }>; onChange: (values: string[]) => void }) => <button type="button" aria-label={`${label}: ${values.join(', ')}`} onClick={() => onChange(values.length ? [] : options.slice(0, 1).map((option) => option.value))}>{values.join(', ')}</button>
}))

import { EMPTY_TRACE_BUILDER } from '@lib/traceBuilder'
import { TraceBuilderPanel } from './TraceBuilderPanel'

describe('TraceBuilderPanel generated TraceQL', () => {
  beforeEach(() => copyTextToClipboard.mockReset())
  afterEach(cleanup)

  it('uses the shared builder form, row, and field structure without a local control wrapper', () => {
    const { container } = render(<TraceBuilderPanel
      value={{ ...EMPTY_TRACE_BUILDER, protocol: 'http' }}
      traceql="{}"
      schemas={[]}
      metadataStatus="loaded"
      metadataError={null}
      messagingSystems={[]}
      messagingSystemsLoading={false}
      messagingSystemsError={null}
      onChange={vi.fn()}
      onOpenTraceql={vi.fn()}
    />)

    const form = container.querySelector('[data-tempo-builder]')
    const coreRow = form?.querySelector('[data-tempo-builder-row="core"]')
    const detailRow = form?.querySelector('[data-tempo-builder-row="detail"]')
    expect(form?.hasAttribute('data-builder-form')).toBe(true)
    expect(coreRow?.querySelectorAll(':scope > [data-builder-field]')).toHaveLength(6)
    expect(detailRow?.querySelectorAll(':scope > [data-builder-field]')).toHaveLength(2)

    const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/components/builder/tempo/TraceBuilderPanel.module.css'), 'utf8')
    expect(css).not.toMatch(/\.control\s*\{/)
  })

  it('starts collapsed, expands the complete query, copies TraceQL, and opens plain mode', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    const onOpenTraceql = vi.fn()
    const traceql = '{ resource.service.name = "checkout" && duration > 300ms }'
    render(<TraceBuilderPanel
      value={{ ...EMPTY_TRACE_BUILDER, service: 'checkout', minDurationMs: '300' }}
      traceql={traceql}
      schemas={[]}
      metadataStatus="loaded"
      metadataError={null}
      messagingSystems={[]}
      messagingSystemsLoading={false}
      messagingSystemsError={null}
      onChange={vi.fn()}
      onOpenTraceql={onOpenTraceql}
    />)

    const disclosure = screen.getByText('Generated TraceQL').closest('details') as HTMLDetailsElement
    expect(disclosure).toBeTruthy()
    expect(disclosure.open).toBe(false)
    expect(screen.getByText('Generated TraceQL')).toBeTruthy()

    fireEvent.click(disclosure.querySelector('summary') as HTMLElement)
    expect(disclosure.open).toBe(true)
    expect((screen.getByLabelText('Generated TraceQL query') as HTMLTextAreaElement).value).toBe(traceql)

    fireEvent.click(screen.getByRole('button', { name: 'Copy TraceQL to clipboard' }))
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(traceql))

    fireEvent.click(screen.getByRole('button', { name: 'Open in TraceQL mode' }))
    expect(onOpenTraceql).toHaveBeenCalledOnce()
    expect(disclosure.open).toBe(true)
  })

  it('keeps an Include filter selected when its last value is cleared', () => {
    const onChange = vi.fn()
    const filter = { attribute: 'resource.cloud.region', scope: 'resource' as const, mode: 'include' as const, values: ['eu-west-1'] }
    const props = { traceql: '{ resource.cloud.region = "eu-west-1" }', schemas: [], metadataStatus: 'loaded' as const, metadataError: null, messagingSystems: [], messagingSystemsLoading: false, messagingSystemsError: null, onChange, onOpenTraceql: vi.fn() }
    const { rerender } = render(<TraceBuilderPanel value={{ ...EMPTY_TRACE_BUILDER, advancedFilters: [filter] }} {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'resource.cloud.region values: eu-west-1' }))
    const cleared = { ...filter, values: [] }
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({ advancedFilters: [cleared] })

    rerender(<TraceBuilderPanel value={{ ...EMPTY_TRACE_BUILDER, advancedFilters: [cleared] }} {...props} traceql="{ span:duration > 300ms }" />)
    expect(screen.getByText('cloud.region')).toBeTruthy()
    expect(screen.queryByText(/active$/)).toBeNull()
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('renders one facet for each selected attribute without raw operators', () => {
    render(<TraceBuilderPanel value={{ ...EMPTY_TRACE_BUILDER, advancedFilters: [
      { attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1', 'eu-west-3'] },
      { attribute: 'span.http.route', scope: 'span', mode: 'exclude', values: ['/health'] }
    ] }} traceql="{}" schemas={[]} metadataStatus="loaded" metadataError={null} messagingSystems={[]} messagingSystemsLoading={false} messagingSystemsError={null} attributes={[]} attributeValues={{}} onChange={vi.fn()} onOpenTraceql={vi.fn()} />)
    expect(screen.getByText('cloud.region')).toBeTruthy()
    expect(screen.getByText('http.route')).toBeTruthy()
    expect(screen.queryByText('Attribute')).toBeNull()
    expect(screen.queryByText('Match')).toBeNull()
    expect(screen.queryByText('Values')).toBeNull()
    expect(screen.getByRole('button', { name: 'resource.cloud.region values: eu-west-1, eu-west-3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'resource.cloud.region match mode: include' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'span.http.route match mode: exclude' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Any' })).toBeNull()
    expect(screen.queryByText('Operator')).toBeNull()
    expect(screen.getByText('2 active')).toBeTruthy()
    expect(document.querySelectorAll('[class*="facet"]').length).toBeGreaterThan(0)
    const advanced = screen.getByText('Advanced filters').closest('details')!
    const generated = screen.getByText('Generated TraceQL').closest('[data-generated-query-panel]')!
    expect(advanced.hasAttribute('data-generated-query-panel')).toBe(false)
    expect(generated.hasAttribute('data-generated-query-panel')).toBe(true)
  })

  it('defaults a newly selected attribute to Include and removes it to express no filter', () => {
    const onChange = vi.fn()
    render(<TraceBuilderPanel value={EMPTY_TRACE_BUILDER} traceql="{}" schemas={[]} metadataStatus="loaded" metadataError={null} messagingSystems={[]} messagingSystemsLoading={false} messagingSystemsError={null} attributes={[{ scope: 'resource', name: 'env', traceql: 'resource.env' }]} onChange={onChange} onOpenTraceql={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Attributes:' }))
    expect(onChange).toHaveBeenCalledWith({ advancedFilters: [{ attribute: 'resource.env', scope: 'resource', mode: 'include', values: [] }] })
    expect(screen.queryByText(/active$/)).toBeNull()
  })

  it('uses a scalar editor, preserves values across operators, and counts active comparisons', () => {
    const onChange = vi.fn()
    const filter = { attribute: 'span.http.status_code', scope: 'span' as const, mode: 'compare' as const, operator: '>' as const, value: '500' }
    render(<TraceBuilderPanel value={{ ...EMPTY_TRACE_BUILDER, advancedFilters: [filter] }} traceql="{}" schemas={[]} metadataStatus="loaded" metadataError={null} messagingSystems={[]} messagingSystemsLoading={false} messagingSystemsError={null} onChange={onChange} onOpenTraceql={vi.fn()} />)
    expect(screen.getByLabelText('span.http.status_code value')).toBeTruthy()
    expect(screen.getByText('1 active')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('span.http.status_code value'), { target: { value: '600' } })
    expect(onChange).toHaveBeenCalledWith({ advancedFilters: [{ ...filter, value: '600' }] })
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'span.http.status_code match mode: >' }))
    expect(onChange).toHaveBeenCalledWith({ advancedFilters: [{ ...filter, operator: '>=' }] })
  })

  it('keeps a comparison filter selected when its scalar value is cleared', () => {
    const onChange = vi.fn()
    const filter = { attribute: 'span.http.status_code', scope: 'span' as const, mode: 'compare' as const, operator: '>=' as const, value: '500' }
    const props = { traceql: '{ span.http.status_code >= 500 }', schemas: [], metadataStatus: 'loaded' as const, metadataError: null, messagingSystems: [], messagingSystemsLoading: false, messagingSystemsError: null, onChange, onOpenTraceql: vi.fn() }
    const { rerender } = render(<TraceBuilderPanel value={{ ...EMPTY_TRACE_BUILDER, advancedFilters: [filter] }} {...props} />)

    fireEvent.change(screen.getByLabelText('span.http.status_code value'), { target: { value: '' } })
    const cleared = { ...filter, value: '' }
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({ advancedFilters: [cleared] })

    rerender(<TraceBuilderPanel value={{ ...EMPTY_TRACE_BUILDER, advancedFilters: [cleared] }} {...props} traceql="{ span:duration > 300ms }" />)
    expect(screen.getByText('http.status_code')).toBeTruthy()
    expect(screen.getByLabelText('span.http.status_code value')).toBeTruthy()
    expect(screen.queryByText(/active$/)).toBeNull()
    expect(onChange).toHaveBeenCalledOnce()
  })
})
