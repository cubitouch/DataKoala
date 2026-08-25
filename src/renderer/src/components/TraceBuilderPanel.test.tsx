import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { copyTextToClipboard } = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }))
vi.mock('../lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, ...props }: { value: string; 'aria-label'?: string }) => <textarea aria-label={props['aria-label']} value={value} readOnly />
}))
vi.mock('./ui/combobox', () => ({
  Combobox: ({ label, value }: { label: string; value: string }) => <button type="button" aria-label={`${label}: ${value}`}>{value}</button>,
  MultiCombobox: ({ label, values, options, onChange }: { label: string; values: string[]; options: Array<{ value: string }>; onChange: (values: string[]) => void }) => <button type="button" aria-label={`${label}: ${values.join(', ')}`} onClick={() => onChange(values.length ? [] : options.slice(0, 1).map((option) => option.value))}>{values.join(', ')}</button>
}))

import { EMPTY_TRACE_BUILDER } from '../lib/traceBuilder'
import { TraceBuilderPanel } from './TraceBuilderPanel'

describe('TraceBuilderPanel generated TraceQL', () => {
  beforeEach(() => copyTextToClipboard.mockReset())
  afterEach(cleanup)

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

  it('reconciles builder fields when TraceQL changes externally', async () => {
    const onChange = vi.fn()
    const common = {
      schemas: [],
      metadataStatus: 'loaded' as const,
      metadataError: null,
      messagingSystems: [],
      messagingSystemsLoading: false,
      messagingSystemsError: null,
      onChange,
      onOpenTraceql: vi.fn()
    }
    const { rerender } = render(<TraceBuilderPanel value={EMPTY_TRACE_BUILDER} traceql="{}" {...common} />)
    onChange.mockClear()

    rerender(<TraceBuilderPanel value={EMPTY_TRACE_BUILDER} traceql={'{ resource.service.name = "checkout-api" }'} {...common} />)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ service: 'checkout-api' })))
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
    expect(screen.getAllByRole('group', { name: /match mode/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Include' })[0].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('button', { name: 'Exclude' })[1].getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Any' })).toBeNull()
    expect(screen.queryByText('Operator')).toBeNull()
    expect(screen.getByText('2 active')).toBeTruthy()
    expect(document.querySelectorAll('[class*="facet"]').length).toBeGreaterThan(0)
    const advanced = screen.getByText('Advanced filters').closest('details')!
    const generated = screen.getByText('Generated TraceQL').closest('details')!
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
})
