// @vitest-environment jsdom
import { afterEach, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AiQueryContext } from '@shared/ai'
import { AiContextPopover } from './AiContextPopover'

afterEach(cleanup)

const relation = (
  schema: string,
  name: string,
  column = 'id',
): AiQueryContext['relations'][number] => ({
  schema,
  name,
  kind: 'table',
  columns: [{ name: column, dataType: 'text' }],
})

const context = (
  relations: AiQueryContext['relations'],
  availableRelations?: AiQueryContext['availableRelations'],
): AiQueryContext => ({
  language: { kind: 'sql', dialect: 'postgres' },
  relations,
  ...(availableRelations === undefined ? {} : { availableRelations }),
})

function renderDetails({
  value,
  discovery = null,
}: {
  value: AiQueryContext
  discovery?: {
    initialContext: AiQueryContext
    request: { searchTerms: string[]; reason: string }
    addedRelations: string[]
  } | null
}) {
  render(
    <AiContextPopover
      prompt="show revenue"
      query="select * from public.orders"
      context={value}
      discovery={discovery}
      preparing={false}
      sent={false}
      proposal={null}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
}

describe('AiContextPopover relation catalog', () => {
  it('shows names-only relations separately from detailed schema metadata', () => {
    renderDetails({
      value: context(
        [
          {
            schema: 'public',
            name: 'orders',
            kind: 'table',
            columns: [
              { name: 'id', dataType: 'uuid' },
              { name: 'revenue', dataType: 'numeric' },
            ],
          },
        ],
        [
          { schema: 'analytics', name: 'customers' },
          { schema: 'analytics', name: 'subscriptions' },
        ],
      ),
    })

    const schema = screen.getByLabelText('Schema metadata')
    expect(within(schema).getByText(/public\.orders/)).toBeTruthy()
    expect(within(schema).getByText('1 relations · 2 columns')).toBeTruthy()

    const catalog = within(schema).getByLabelText('Available relation names')
    expect(
      within(catalog).getByText('2 additional relations · names only'),
    ).toBeTruthy()
    expect(within(catalog).getByText('analytics.customers')).toBeTruthy()
    expect(within(catalog).getByText('analytics.subscriptions')).toBeTruthy()
    expect(within(catalog).queryByText(/customers\n/)).toBeNull()
  })

  it.each([
    ['missing', undefined],
    ['empty', []],
  ] as const)('omits the catalog section when it is %s', (_label, catalog) => {
    renderDetails({
      value: context([relation('public', 'orders')], catalog),
    })

    expect(screen.queryByLabelText('Available relation names')).toBeNull()
  })

  it('keeps initial and final discovery catalogs associated with their own schema sections', () => {
    const initialContext = context(
      [relation('initial', 'orders', 'initial_id')],
      [{ schema: 'initial', name: 'names_only' }],
    )
    const finalContext = context(
      [
        relation('final', 'orders', 'final_id'),
        relation('final', 'discovered', 'revenue'),
      ],
      [{ schema: 'final', name: 'names_only' }],
    )

    renderDetails({
      value: finalContext,
      discovery: {
        initialContext,
        request: {
          searchTerms: ['revenue'],
          reason: 'Need the revenue relation.',
        },
        addedRelations: ['final.discovered'],
      },
    })

    const initial = screen.getByLabelText('Initial schema metadata')
    const final = screen.getByLabelText('Final schema metadata')

    expect(within(initial).getByText(/initial\.orders/)).toBeTruthy()
    expect(
      within(initial)
        .getByLabelText('Available relation names')
        .textContent,
    ).toContain('initial.names_only')
    expect(within(initial).queryByText('final.names_only')).toBeNull()

    expect(within(final).getByText(/final\.discovered/)).toBeTruthy()
    expect(
      within(final)
        .getByLabelText('Available relation names')
        .textContent,
    ).toContain('final.names_only')
    expect(within(final).queryByText('initial.names_only')).toBeNull()
  })
})
