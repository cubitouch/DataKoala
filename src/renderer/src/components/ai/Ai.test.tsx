// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { createRef } from 'react'
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  models: vi.fn(),
  test: vi.fn(),
  propose: vi.fn(),
  proposeBuilder: vi.fn(),
  cancel: vi.fn(),
  run: vi.fn(),
  columns: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    ai: {
      settings: {
        get: mocks.get,
        save: mocks.save,
        removeApiKey: mocks.remove,
      },
      listModels: mocks.models,
      test: mocks.test,
      proposeQuery: mocks.propose,
      proposeBuilder: mocks.proposeBuilder,
      cancel: mocks.cancel,
    },
    query: { run: mocks.run },
  },
}))
vi.mock('@lib/relationColumns', () => ({
  ensureRelationColumns: mocks.columns,
}))
import { AiSettingsAction } from './AiSettingsAction'
import { AiSettingsModal } from './AiSettingsModal'
import { AiQueryCopilot } from './AiQueryCopilot'
import { AiBuilderCopilot } from './AiBuilderCopilot'
import { AiQueryRepair } from './AiQueryRepair'
import { AiQueryRepairProvider } from './AiQueryRepairProvider'
import { AiQueryRepairReview } from './AiQueryRepairReview'
import {
  patchActiveTestSession,
  resetTestStore,
  setActiveTestMetadata,
} from '@test/sessionTestUtils'
import {
  createQuerySession,
  selectActiveSession,
  useStore,
} from '@store/useStore'
import type { AiBuilderStep, AiQueryStep, AiResult } from '@shared/ai'
import { generateBuilderQuery } from '@lib/builderSql'
const summary = {
  provider: 'openrouter',
  model: 'saved/model',
  hasApiKey: true,
}
const proposed = {
  query: 'SELECT count(*) FROM public.orders',
  explanation: 'Count orders.',
  assumptions: ['All orders.'],
}
const ok = <T,>(value: T) => ({ ok: true as const, value })
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.get.mockResolvedValue(ok(summary))
  mocks.save.mockResolvedValue(ok(summary))
  mocks.remove.mockResolvedValue(ok({ ...summary, hasApiKey: false }))
  mocks.models.mockResolvedValue(
    ok([{ id: 'other/model', name: 'Other model' }]),
  )
  mocks.test.mockResolvedValue(ok(undefined))
  mocks.cancel.mockResolvedValue(ok(undefined))
  mocks.columns.mockImplementation(async () => [
    { name: 'id', dataTypeName: 'uuid' },
  ])
  mocks.propose.mockResolvedValue(
    ok({ kind: 'proposal', proposal: proposed } as AiQueryStep),
  )
  mocks.proposeBuilder.mockResolvedValue(
    ok({
      kind: 'proposal',
      proposal: {
        patch: {
          xColumn: 'country',
          valueColumn: 'revenue',
          aggregation: 'sum',
        },
        explanation: 'Sum revenue by country.',
        assumptions: [],
      },
    } as AiBuilderStep),
  )
  resetTestStore({
    profiles: [
      {
        id: 'pg',
        name: 'Postgres',
        kind: 'postgres',
        version: 2,
        host: 'private-host',
        port: 5432,
        database: 'db',
        user: 'private-user',
        password: 'private-password',
        tlsMode: 'disable',
        readonly: true,
      },
    ],
  })
  patchActiveTestSession({ connectionProfileId: 'pg', sql: '' })
  setActiveTestMetadata(
    [
      {
        name: 'public',
        isSystem: false,
        relations: [
          {
            schema: 'public',
            name: 'orders',
            kind: 'r',
            qualifiedName: 'public.orders',
            columnsStatus: 'idle',
          },
        ],
      },
    ],
    'loaded',
    null,
    'pg',
  )
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)
async function generate() {
  fireEvent.change(await screen.findByRole('textbox', { name: 'AI prompt' }), {
    target: { value: 'count orders' },
  })
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Ask',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
  await waitFor(() => expect(mocks.propose).toHaveBeenCalled())
}

function renderRepair() {
  return render(
    <AiQueryRepairProvider>
      <AiQueryRepair />
      <AiQueryRepairReview onApplied={() => undefined} />
    </AiQueryRepairProvider>,
  )
}
test('sidebar button opens settings without auto-opening help and Escape restores focus', async () => {
  render(<AiSettingsAction />)
  const trigger = screen.getByRole('button', { name: 'Settings' })
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Settings' })
  await waitFor(() => expect(document.activeElement).toBe(dialog))
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})
test('settings keep saved keys hidden, preserve missing model, test draft settings separately and remove key', async () => {
  const close = vi.fn()
  render(<AiSettingsModal returnFocusRef={createRef()} onClose={close} />)
  await screen.findByText(/API key saved/)
  const key = screen.getByLabelText('API key') as HTMLInputElement
  expect(key.type).toBe('password')
  expect(key.value).toBe('••••••••••••••••')
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  await screen.findByText(/Connection successful/)
  expect(mocks.test).toHaveBeenLastCalledWith(expect.any(String), {
    model: 'saved/model',
    apiKey: '',
  })
  expect(screen.getAllByText('saved/model').length).toBeGreaterThan(0)
  fireEvent.change(key, { target: { value: '••draft-placeholder' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  await screen.findByText(/Connection successful/)
  expect(
    screen.getByRole('status', { name: 'Success' }).getAttribute('data-tone'),
  ).toBe('success')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.test).toHaveBeenCalledWith(expect.any(String), {
    model: 'saved/model',
    apiKey: 'draft-placeholder',
  })
  expect(mocks.save).not.toHaveBeenCalled()
  fireEvent.change(key, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(close).toHaveBeenCalled())
  expect(mocks.save).toHaveBeenCalledWith({ model: 'saved/model', apiKey: '' })
  fireEvent.click(screen.getByRole('button', { name: 'Remove API key' }))
  await screen.findByText('API key removed.')
  expect(mocks.remove).toHaveBeenCalled()
  expect(key.value).toBe('')
})
test('settings model picker searches catalog and saves canonical model id', async () => {
  render(<AiSettingsModal returnFocusRef={createRef()} onClose={vi.fn()} />)
  await screen.findAllByText('saved/model')
  fireEvent.click(screen.getByRole('combobox'))
  const search = screen.getByRole('textbox')
  fireEvent.change(search, { target: { value: 'Other' } })
  fireEvent.click(screen.getByRole('option', { name: /Other model/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      model: 'other/model',
      apiKey: '',
    }),
  )
})
for (const initialSql of ['', 'SELECT id FROM public.orders']) {
  test(`proposal requires Apply and never executes; initial SQL: ${initialSql || 'empty'}`, async () => {
    patchActiveTestSession({ sql: initialSql })
    render(<AiQueryCopilot />)
    await generate()
    await screen.findByRole('button', { name: 'Apply' })
    expect(selectActiveSession(useStore.getState()).sql).toBe(initialSql)
    const request = mocks.propose.mock.calls[0][0]
    expect(request.currentQuery).toBe(initialSql || undefined)
    expect(JSON.stringify(request)).not.toMatch(
      /private-host|private-user|private-password/,
    )
    expect(request.context.relations[0].columns[0].name).toBe('id')
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(selectActiveSession(useStore.getState()).sql).toBe(proposed.query)
    expect(mocks.run).not.toHaveBeenCalled()
  })
}
for (const change of ['query', 'tab', 'connection'] as const) {
  test(`stale ${change} change, even changed back, cannot apply proposal`, async () => {
    const pending = deferred<AiResult<AiQueryStep>>()
    mocks.propose.mockReturnValue(pending.promise)
    render(<AiQueryCopilot />)
    await generate()
    const state = useStore.getState()
    act(() => {
      if (change === 'query') {
        patchActiveTestSession({ sql: 'new work' })
        patchActiveTestSession({ sql: '' })
      }
      if (change === 'connection') {
        patchActiveTestSession({ connectionProfileId: 'other' })
        patchActiveTestSession({ connectionProfileId: 'pg' })
      }
      if (change === 'tab') {
        const other = createQuerySession(2)
        useStore.setState({
          tabs: [...state.tabs, other],
          activeTabId: other.id,
        })
        useStore.setState({ activeTabId: state.activeTabId })
      }
    })
    await act(async () =>
      pending.resolve(ok({ kind: 'proposal', proposal: proposed })),
    )
    expect(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(selectActiveSession(useStore.getState()).sql).toBe('')
  })
}
test('Cancel aborts and ignores a late successful response', async () => {
  const pending = deferred<AiResult<AiQueryStep>>()
  mocks.propose.mockReturnValue(pending.promise)
  render(<AiQueryCopilot />)
  await generate()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(mocks.cancel).toHaveBeenCalledWith(
    mocks.propose.mock.calls[0][0].requestId,
  )
  await act(async () =>
    pending.resolve(ok({ kind: 'proposal', proposal: proposed })),
  )
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  expect(selectActiveSession(useStore.getState()).sql).toBe('')
})
test('unmounting the tab copilot aborts its active request', async () => {
  mocks.propose.mockReturnValue(new Promise(() => {}))
  render(<AiQueryCopilot />)
  await generate()
  cleanup()
  expect(mocks.cancel).toHaveBeenCalledWith(
    mocks.propose.mock.calls[0][0].requestId,
  )
  expect(screen.queryByRole('dialog')).toBeNull()
})
test('provider errors remain visible and unconfigured copilot stays hidden', async () => {
  mocks.propose.mockResolvedValue({
    ok: false,
    code: 'authentication',
    message: 'Check your API key.',
  })
  render(<AiQueryCopilot />)
  await generate()
  await screen.findByRole('alert')
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Ask',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  )
  expect(screen.getByRole('alert').textContent).toBe('Check your API key.')
  cleanup()

  mocks.get.mockClear()
  mocks.get.mockResolvedValue(ok({ ...summary, hasApiKey: false }))
  render(<AiQueryCopilot />)
  await waitFor(() => expect(mocks.get).toHaveBeenCalled())
  expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
  expect(screen.queryByLabelText('SQL AI copilot')).toBeNull()
})

test('Ask AI uses retry-friendly copy for an invalid structured response', async () => {
  mocks.propose
    .mockResolvedValueOnce({
      ok: false,
      code: 'invalid-response',
      message:
        'The model returned an invalid query step. Try again or choose another model.',
    })
    .mockResolvedValueOnce(
      ok({ kind: 'proposal', proposal: proposed } as AiQueryStep),
    )

  render(<AiQueryCopilot />)
  const input = await screen.findByRole('textbox', { name: 'AI prompt' })
  fireEvent.change(input, { target: { value: 'fix it' } })
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain(
    "AI couldn't produce a usable query from that request.",
  )
  expect(alert.textContent).toContain(
    'Try adding a little more detail about what you want the query to do.',
  )
  expect(alert.textContent).not.toMatch(/invalid query step/i)
  expect(alert.textContent).not.toMatch(/choose another model/i)
  expect((input as HTMLInputElement).value).toBe('fix it')
  expect(selectActiveSession(useStore.getState()).sql).toBe('')
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  expect(mocks.run).not.toHaveBeenCalled()

  fireEvent.change(input, {
    target: { value: 'count all orders grouped by country' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
  expect(await screen.findByRole('button', { name: 'Apply' })).toBeTruthy()
  expect((input as HTMLInputElement).value).toBe(
    'count all orders grouped by country',
  )
})

test('Ask AI preserves genuine model/settings guidance', async () => {
  mocks.propose.mockResolvedValueOnce({
    ok: false,
    code: 'model',
    message:
      'This model is unavailable or does not support structured output. Choose another model in AI settings.',
  })

  render(<AiQueryCopilot />)
  await generate()

  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain(
    'This model is unavailable or does not support structured output.',
  )
  expect(alert.textContent).toContain('Choose another model in AI settings.')
  expect(alert.textContent).not.toContain(
    "AI couldn't produce a usable query from that request.",
  )
})

test('Ask AI maps invalid response from discovery retry to friendly copy', async () => {
  setDiscoveryMetadata()
  mocks.propose
    .mockResolvedValueOnce(ok(contextRequest()))
    .mockResolvedValueOnce({
      ok: false,
      code: 'invalid-response',
      message:
        'The model returned an invalid query step. Try again or choose another model.',
    })

  render(<AiQueryCopilot />)
  await generate()

  const alert = await screen.findByRole('alert')
  expect(mocks.propose).toHaveBeenCalledTimes(2)
  expect(alert.textContent).toContain(
    "AI couldn't produce a usable query from that request.",
  )
  expect(alert.textContent).toContain(
    'Try adding a little more detail about what you want the query to do.',
  )
  expect(alert.textContent).not.toMatch(/invalid query step/i)
  expect(alert.textContent).not.toMatch(/choose another model/i)
  expect(selectActiveSession(useStore.getState()).sql).toBe('')
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  expect(mocks.run).not.toHaveBeenCalled()
})

test('inline composer submits on Enter, reports loading, and prevents parent Run shortcuts', async () => {
  mocks.propose.mockReturnValue(new Promise(() => {}))
  const parentShortcut = vi.fn()
  render(
    <div onKeyDown={parentShortcut}>
      <AiQueryCopilot />
    </div>,
  )
  const input = await screen.findByRole('textbox', { name: 'AI prompt' })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.change(input, { target: { value: 'count orders' } })
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Ask',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  )
  fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
  await screen.findByText('Generating query…')
  await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(1))
  expect(parentShortcut).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  expect((input as HTMLInputElement).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull()
  expect(selectActiveSession(useStore.getState()).sql).toBe('')
})
test('diff stays inline and AI details combine reasoning with submitted context; Reject keeps SQL and prompt', async () => {
  patchActiveTestSession({ sql: 'SELECT id FROM public.orders' })
  render(<AiQueryCopilot />)
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
  expect(
    screen
      .getByRole('region', { name: 'SQL proposal diff' })
      .querySelector('[data-diff-kind="remove"]'),
  ).toBeTruthy()
  expect(
    screen
      .getByRole('region', { name: 'SQL proposal diff' })
      .querySelector('[data-diff-kind="add"]'),
  ).toBeTruthy()
  expect(screen.queryByText(proposed.explanation)).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
  const response = await screen.findByRole('region', { name: 'AI response' })
  expect(response.textContent).toContain(proposed.explanation)
  expect(response.textContent).toContain(proposed.assumptions[0])
  expect(screen.getByText('Submitted context')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Prompt' }).textContent).toContain(
    'count orders',
  )
  expect(
    screen.getByRole('region', { name: 'Current SQL' }).textContent,
  ).toContain('SELECT id FROM public.orders')
  expect(screen.queryByRole('dialog', { name: /reasoning/i })).toBeNull()
  fireEvent.keyDown(document, { key: 'Escape' })

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
  expect(selectActiveSession(useStore.getState()).sql).toBe(
    'SELECT id FROM public.orders',
  )
  expect(
    (screen.getByRole('textbox', { name: 'AI prompt' }) as HTMLInputElement)
      .value,
  ).toBe('count orders')
  expect(screen.queryByRole('region', { name: 'SQL proposal diff' })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'AI prompt' }), {
    target: { value: 'count recent orders' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
  await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(2))
})
test('empty editor diff is all additions and Apply clears the prompt', async () => {
  render(<AiQueryCopilot />)
  await generate()
  const diff = await screen.findByRole('region', { name: 'SQL proposal diff' })
  expect(diff.querySelector('[data-diff-kind="add"]')).toBeTruthy()
  expect(diff.querySelector('[data-diff-kind="remove"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.queryByRole('region', { name: 'SQL proposal diff' })).toBeNull()
  expect(
    (screen.getByRole('textbox', { name: 'AI prompt' }) as HTMLInputElement)
      .value,
  ).toBe('')
})

test('unchanged Ask AI proposal shows guidance instead of an empty diff', async () => {
  const sql = 'SELECT id FROM public.orders'
  patchActiveTestSession({ sql })
  mocks.propose.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: {
        ...proposed,
        query: sql,
      },
    } as AiQueryStep),
  )

  render(<AiQueryCopilot />)
  await generate()

  const diff = await screen.findByRole('region', { name: 'SQL proposal diff' })
  expect(screen.getByText('No SQL changes proposed')).toBeTruthy()
  expect(
    screen.getByText(
      /AI did not propose any SQL changes for this request.*Try adding a little more detail/s,
    ),
  ).toBeTruthy()
  expect(diff.querySelector('[data-diff-kind="add"]')).toBeNull()
  expect(diff.querySelector('[data-diff-kind="remove"]')).toBeNull()
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  expect(selectActiveSession(useStore.getState()).sql).toBe(sql)
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Fix with AI sends sanitized provenance and Apply changes SQL without running it', async () => {
  const failed = 'SELECT device_id FROM public.orders'
  const safeError =
    'ERROR: column orders.device_id does not exist LINE 4 Position: 87 SQLSTATE 42703 password=[REDACTED]'
  patchActiveTestSession({
    sql: failed,
    queryMode: 'sql',
    queryError: `${safeError} password=hunter2`,
    repairableQueryError: { query: failed, error: safeError },
  })
  renderRepair()
  fireEvent.click(await screen.findByRole('button', { name: 'Fix with AI' }))
  await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(1))
  expect(mocks.propose).toHaveBeenCalledWith(
    expect.objectContaining({
      intent: 'repair',
      currentQuery: failed,
      error: safeError,
    }),
  )
  expect(mocks.propose.mock.calls[0][0]).not.toHaveProperty('prompt')
  expect(JSON.stringify(mocks.propose.mock.calls[0][0])).not.toContain(
    'hunter2',
  )
  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
  expect(screen.queryByRole('region', { name: 'Prompt' })).toBeNull()
  expect(
    screen.getByRole('region', { name: 'Failed SQL' }).textContent,
  ).toContain(failed)
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
  expect(selectActiveSession(useStore.getState()).sql).toBe(proposed.query)
  expect(
    selectActiveSession(useStore.getState()).repairableQueryError,
  ).toBeNull()
  expect(mocks.run).not.toHaveBeenCalled()
})

test('BigQuery repair keeps original provenance through retry and never auto-runs', async () => {
  const failed =
    'SELECT country, SUM(revenu) FROM `my-project.analytics.orders` GROUP BY country'
  const safeError = 'Unrecognized name: revenu at [1:21]'
  const fixed =
    'SELECT country, SUM(revenue) FROM `my-project.analytics.orders` GROUP BY country'

  resetTestStore({
    profiles: [
      {
        id: 'bq',
        name: 'BigQuery',
        kind: 'bigquery',
        version: 1,
        billingProject: 'billing-project',
        defaultProject: 'my-project',
        defaultDataset: 'analytics',
        maximumBytesBilled: '',
        readonly: true,
      },
    ],
  })
  patchActiveTestSession({
    connectionProfileId: 'bq',
    sql: failed,
    queryMode: 'sql',
    queryError: safeError,
    repairableQueryError: { query: failed, error: safeError },
  })
  setActiveTestMetadata(
    [
      {
        name: 'my-project.analytics',
        isSystem: false,
        relations: [
          {
            schema: 'my-project.analytics',
            name: 'orders',
            kind: 'r',
            qualifiedName: 'my-project.analytics.orders',
            columnsStatus: 'loaded',
            columns: [
              { name: 'country', dataTypeName: 'STRING' },
              { name: 'revenue', dataTypeName: 'NUMERIC' },
            ],
          },
        ],
      },
    ],
    'loaded',
    null,
    'bq',
  )

  mocks.propose.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: { ...proposed, query: fixed },
    } as AiQueryStep),
  )
  const retry = deferred<AiResult<AiQueryStep>>()
  renderRepair()
  fireEvent.click(await screen.findByRole('button', { name: 'Fix with AI' }))
  await screen.findByRole('region', { name: 'SQL proposal diff' })

  expect(mocks.propose.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      intent: 'repair',
      currentQuery: failed,
      error: safeError,
      context: expect.objectContaining({
        language: { kind: 'sql', dialect: 'google-sql' },
      }),
    }),
  )
  expect(selectActiveSession(useStore.getState()).sql).toBe(failed)
  expect(mocks.run).not.toHaveBeenCalled()

  mocks.propose.mockReturnValueOnce(retry.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(2))
  expect(mocks.propose.mock.calls[1][0]).toEqual(
    expect.objectContaining({
      intent: 'repair',
      currentQuery: failed,
      error: safeError,
    }),
  )
  expect(screen.getByRole('region', { name: 'SQL proposal diff' })).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('region', { name: 'SQL proposal diff' })).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)

  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(selectActiveSession(useStore.getState()).sql).toBe(fixed)
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Fix with AI keeps the SQL failure primary before repair starts', async () => {
  const failed = 'SELECT device_id FROM public.orders'
  patchActiveTestSession({
    sql: failed,
    queryMode: 'sql',
    queryError: 'ERROR: column orders.device_id does not exist',
    repairableQueryError: {
      query: failed,
      error: 'ERROR: column orders.device_id does not exist',
    },
  })

  renderRepair()

  expect(
    await screen.findByRole('button', { name: 'Fix with AI' }),
  ).toBeTruthy()
  expect(screen.queryByText('AI repair')).toBeNull()
})

test('Fix with AI shows a compact cancellable busy state', async () => {
  const failed = 'SELECT device_id FROM public.orders'
  patchActiveTestSession({
    sql: failed,
    queryMode: 'sql',
    queryError: 'ERROR: column orders.device_id does not exist',
    repairableQueryError: {
      query: failed,
      error: 'ERROR: column orders.device_id does not exist',
    },
  })
  const pending = deferred<AiResult<AiQueryStep>>()
  mocks.propose.mockReturnValue(pending.promise)

  renderRepair()
  fireEvent.click(await screen.findByRole('button', { name: 'Fix with AI' }))

  expect(await screen.findByText('Fixing with AI…')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Fix with AI' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
})

test('invalid repair response uses retry-friendly copy and preserves retry', async () => {
  const failed = 'SELECT device_id FROM public.orders'
  patchActiveTestSession({
    sql: failed,
    queryMode: 'sql',
    queryError: 'ERROR: column orders.device_id does not exist',
    repairableQueryError: {
      query: failed,
      error: 'ERROR: column orders.device_id does not exist',
    },
  })
  mocks.propose
    .mockResolvedValueOnce({
      ok: false,
      code: 'invalid-response',
      message:
        'The model returned an invalid query step. Try again or choose another model.',
    })
    .mockResolvedValueOnce(
      ok({ kind: 'proposal', proposal: proposed } as AiQueryStep),
    )

  renderRepair()
  fireEvent.click(await screen.findByRole('button', { name: 'Fix with AI' }))

  expect(await screen.findByText('AI repair')).toBeTruthy()
  expect(
    screen.getByText(/AI couldn't produce a usable repair this time/),
  ).toBeTruthy()
  expect(screen.getByText(/Your query was not changed/)).toBeTruthy()
  expect(screen.queryByText(/invalid query step/i)).toBeNull()
  expect(screen.queryByText(/choose another model/i)).toBeNull()
  expect(selectActiveSession(useStore.getState()).sql).toBe(failed)
  expect(
    selectActiveSession(useStore.getState()).repairableQueryError,
  ).not.toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Fix with AI' }))
  expect(await screen.findByText('Proposed changes')).toBeTruthy()
})

test('model repair failure preserves model/settings guidance', async () => {
  const failed = 'SELECT device_id FROM public.orders'
  patchActiveTestSession({
    sql: failed,
    queryMode: 'sql',
    queryError: 'ERROR: column orders.device_id does not exist',
    repairableQueryError: {
      query: failed,
      error: 'ERROR: column orders.device_id does not exist',
    },
  })
  mocks.propose.mockResolvedValueOnce({
    ok: false,
    code: 'model',
    message:
      'This model is unavailable or does not support structured output. Choose another model in AI settings.',
  })

  renderRepair()
  fireEvent.click(await screen.findByRole('button', { name: 'Fix with AI' }))

  expect(await screen.findByText('AI repair')).toBeTruthy()
  expect(screen.getByText(/Choose another model in AI settings/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeTruthy()
})

test('Try again keeps previous diff pending, uses latest SQL and replaces only on response', async () => {
  render(<AiQueryCopilot />)
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
  act(() => patchActiveTestSession({ sql: 'SELECT id FROM public.orders' }))
  const pending = deferred<AiResult<AiQueryStep>>()
  mocks.propose.mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(2))
  expect(mocks.propose.mock.calls[1][0].currentQuery).toBe(
    'SELECT id FROM public.orders',
  )
  expect(mocks.propose.mock.calls[1][0].prompt).toBe('count orders')
  expect(screen.getByRole('region', { name: 'SQL proposal diff' })).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  await act(async () =>
    pending.resolve(
      ok({
        kind: 'proposal',
        proposal: { ...proposed, explanation: 'Updated proposal' },
      }),
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
  expect(await screen.findByText('Updated proposal')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
})
test('context popover discloses current SQL and metadata before and after generation', async () => {
  patchActiveTestSession({ sql: 'SELECT id FROM public.orders' })
  render(<AiQueryCopilot />)
  const input = await screen.findByRole('textbox', { name: 'AI prompt' })
  fireEvent.change(input, { target: { value: 'count orders' } })
  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
  await screen.findByText(/public.orders\s+id uuid/)
  expect(screen.getByRole('region', { name: 'Current SQL' })).toBeTruthy()
  expect(screen.getByText('About this request')).toBeTruthy()
  expect(screen.getByText('Context to send')).toBeTruthy()
  expect(screen.getByText('SELECT id FROM public.orders')).toBeTruthy()
  expect(
    screen.getByText(/Database credentials and query result rows are not sent/),
  ).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Current SQL' })).toBeNull()
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
  expect(screen.getByText(/Submitted context/)).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Prompt' }).textContent).toContain(
    'count orders',
  )
})

test('saving settings enables an already-mounted hidden copilot', async () => {
  mocks.get.mockResolvedValue(ok({ ...summary, hasApiKey: false }))
  render(<AiQueryCopilot />)
  await waitFor(() => expect(mocks.get).toHaveBeenCalled())
  expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()

  mocks.get.mockResolvedValue(ok(summary))
  act(() => window.dispatchEvent(new Event('datakoala:ai-settings-changed')))
  expect(await screen.findByRole('textbox', { name: 'AI prompt' })).toBeTruthy()
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
})
test('cancelled first response cannot replace a newer proposal', async () => {
  const first = deferred<AiResult<AiQueryStep>>()
  mocks.propose.mockReturnValueOnce(first.promise).mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: { ...proposed, explanation: 'Newer proposal' },
    }),
  )
  render(<AiQueryCopilot />)
  await generate()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'View AI details' }),
  )
  await screen.findByText('Newer proposal')
  await act(async () =>
    first.resolve(
      ok({
        kind: 'proposal',
        proposal: { ...proposed, explanation: 'Cancelled proposal' },
      }),
    ),
  )
  expect(screen.queryByText('Cancelled proposal')).toBeNull()
  expect(screen.getByText('Newer proposal')).toBeTruthy()
})

function setDiscoveryMetadata(includeDevice = true) {
  const names = [
    'orders',
    'alpha',
    'beta',
    'delta',
    'gamma',
    'omega',
    ...(includeDevice ? ['zy_devices'] : []),
    'zz_unrelated',
  ]
  setActiveTestMetadata(
    [
      {
        name: 'public',
        isSystem: false,
        relations: names.map((name) => ({
          schema: 'public',
          name,
          kind: 'r' as const,
          qualifiedName: `public.${name}`,
          columnsStatus: 'idle' as const,
        })),
      },
    ],
    'loaded',
    null,
    'pg',
  )
}

const contextRequest = (
  searchTerms = ['device'],
  reason = 'Need device metadata to answer the request.',
): AiQueryStep => ({
  kind: 'context-request',
  request: { searchTerms, reason },
})

test('sufficient initial context uses one provider call only', async () => {
  render(<AiQueryCopilot />)
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
  expect(mocks.propose).toHaveBeenCalledTimes(1)
})

test('context request adds only matching undisclosed metadata and retries once', async () => {
  setDiscoveryMetadata()
  mocks.propose
    .mockResolvedValueOnce(ok(contextRequest()))
    .mockResolvedValueOnce(ok({ kind: 'proposal', proposal: proposed }))
  render(<AiQueryCopilot />)
  await generate()
  await screen.findByRole('button', { name: 'Apply' })

  expect(mocks.propose).toHaveBeenCalledTimes(2)
  const initial = mocks.propose.mock.calls[0][0]
  const expanded = mocks.propose.mock.calls[1][0]
  expect(initial.context.relations).toHaveLength(6)
  expect(
    initial.context.relations.map((item: { name: string }) => item.name),
  ).not.toContain('zy_devices')
  expect(
    expanded.context.relations.map((item: { name: string }) => item.name),
  ).toContain('zy_devices')
  expect(expanded.context.relations).toHaveLength(7)
  expect(expanded.requestId).toBe(initial.requestId)
  expect(mocks.columns.mock.calls.map((call) => call[1].name)).not.toContain(
    'zz_unrelated',
  )
  expect(
    mocks.columns.mock.calls.filter((call) => call[1].name === 'zy_devices'),
  ).toHaveLength(1)
})

test('context request with no local match stops after the first provider call', async () => {
  setDiscoveryMetadata(false)
  mocks.propose.mockResolvedValueOnce(ok(contextRequest()))
  render(<AiQueryCopilot />)
  await generate()
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('“device”')
  expect(alert.textContent).toContain('no undisclosed matching relation')
  expect(alert.textContent).toContain('Make the prompt more specific')
  expect(mocks.propose).toHaveBeenCalledTimes(1)
  expect(mocks.columns.mock.calls.map((call) => call[1].name)).not.toContain(
    'zz_unrelated',
  )
})

test('a second context request stops cleanly without a third provider call', async () => {
  setDiscoveryMetadata()
  mocks.propose
    .mockResolvedValueOnce(ok(contextRequest()))
    .mockResolvedValueOnce(
      ok(contextRequest(['customer'], 'Customer metadata is still missing.')),
    )
  render(<AiQueryCopilot />)
  await generate()
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('after one discovery step')
  expect(alert.textContent).toContain('stops after one expansion')
  expect(mocks.propose).toHaveBeenCalledTimes(2)
})

test('cancelling during metadata expansion prevents the retry provider call', async () => {
  setDiscoveryMetadata()
  const deviceColumns =
    deferred<Array<{ name: string; dataTypeName: string }>>()
  mocks.columns.mockImplementation(
    async (_profileId: string, relation: { name: string }) =>
      relation.name === 'zy_devices'
        ? deviceColumns.promise
        : [{ name: 'id', dataTypeName: 'uuid' }],
  )
  mocks.propose.mockResolvedValueOnce(ok(contextRequest()))
  render(<AiQueryCopilot />)
  await generate()
  await waitFor(() =>
    expect(
      mocks.columns.mock.calls.some((call) => call[1].name === 'zy_devices'),
    ).toBe(true),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await act(async () =>
    deviceColumns.resolve([{ name: 'device_id', dataTypeName: 'uuid' }]),
  )
  await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
})

test('cancelling repair during metadata expansion cannot restore late state', async () => {
  setDiscoveryMetadata()
  const failed = 'SELECT device_id FROM public.orders'
  patchActiveTestSession({
    sql: failed,
    queryMode: 'sql',
    queryError: 'ERROR: column orders.device_id does not exist',
    repairableQueryError: {
      query: failed,
      error: 'ERROR: column orders.device_id does not exist',
    },
  })
  const deviceColumns =
    deferred<Array<{ name: string; dataTypeName: string }>>()
  mocks.columns.mockImplementation(
    async (_profileId: string, relation: { name: string }) =>
      relation.name === 'zy_devices'
        ? deviceColumns.promise
        : [{ name: 'id', dataTypeName: 'uuid' }],
  )
  mocks.propose.mockResolvedValueOnce(ok(contextRequest()))
  renderRepair()
  fireEvent.click(await screen.findByRole('button', { name: 'Fix with AI' }))
  await waitFor(() =>
    expect(
      mocks.columns.mock.calls.some((call) => call[1].name === 'zy_devices'),
    ).toBe(true),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await act(async () =>
    deviceColumns.resolve([{ name: 'device_id', dataTypeName: 'uuid' }]),
  )
  await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText(/no undisclosed matching relation/i)).toBeNull()
  expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeTruthy()
})

for (const change of ['query', 'tab', 'connection'] as const) {
  test(`discovery final proposal is stale after ${change} changes`, async () => {
    setDiscoveryMetadata()
    const second = deferred<AiResult<AiQueryStep>>()
    mocks.propose
      .mockResolvedValueOnce(ok(contextRequest()))
      .mockReturnValueOnce(second.promise)
    render(<AiQueryCopilot />)
    await generate()
    await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(2))

    const state = useStore.getState()
    act(() => {
      if (change === 'query') {
        patchActiveTestSession({ sql: 'new work' })
        patchActiveTestSession({ sql: '' })
      }
      if (change === 'connection') {
        patchActiveTestSession({ connectionProfileId: 'other' })
        patchActiveTestSession({ connectionProfileId: 'pg' })
      }
      if (change === 'tab') {
        const other = createQuerySession(2)
        useStore.setState({
          tabs: [...state.tabs, other],
          activeTabId: other.id,
        })
        useStore.setState({ activeTabId: state.activeTabId })
      }
    })
    await act(async () =>
      second.resolve(ok({ kind: 'proposal', proposal: proposed })),
    )
    expect(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
}

test('AI details exposes initial context, discovery request, added relations and final context', async () => {
  setDiscoveryMetadata()
  mocks.propose
    .mockResolvedValueOnce(ok(contextRequest()))
    .mockResolvedValueOnce(ok({ kind: 'proposal', proposal: proposed }))
  render(<AiQueryCopilot />)
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))

  const discovery = await screen.findByRole('region', {
    name: 'Metadata discovery',
  })
  expect(discovery.textContent).toContain('Requested concepts: device')
  expect(discovery.textContent).toContain(
    'Need device metadata to answer the request.',
  )
  expect(discovery.textContent).toContain('public.zy_devices')
  const initial = screen.getByRole('region', {
    name: 'Initial schema metadata',
  })
  const final = screen.getByRole('region', { name: 'Final schema metadata' })
  expect(
    Array.from(initial.querySelectorAll('pre')).some((item) =>
      item.textContent?.includes('zy_devices'),
    ),
  ).toBe(false)
  expect(
    initial.querySelector('[aria-label="Available relation names"]')
      ?.textContent,
  ).toContain('public.zy_devices')
  expect(
    Array.from(final.querySelectorAll('pre')).some((item) =>
      item.textContent?.includes('public.zy_devices'),
    ),
  ).toBe(true)
  expect(
    final.querySelector('[aria-label="Available relation names"]')?.textContent,
  ).not.toContain('public.zy_devices')
})

function setupBuilderAi() {
  const session = selectActiveSession(useStore.getState())
  patchActiveTestSession({
    queryMode: 'builder',
    builder: {
      table: { schema: 'public', name: 'orders' },
      timeColumn: 'created_at',
      timeBucket: 'day',
      timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
      seriesColumns: [],
    },
    builderVisualization: {
      ...session.builderVisualization,
      xColumn: 'created_at',
      valueColumn: null,
      aggregation: 'count',
      seriesColumn: null,
      seriesColumns: [],
    },
    builderHasRun: true,
  })
  setActiveTestMetadata(
    [
      {
        name: 'public',
        isSystem: false,
        relations: [
          {
            schema: 'public',
            name: 'orders',
            kind: 'r',
            qualifiedName: 'public.orders',
            columnsStatus: 'loaded',
            columns: [
              { name: 'created_at', dataTypeName: 'timestamptz' },
              { name: 'country', dataTypeName: 'text' },
              { name: 'revenue', dataTypeName: 'numeric' },
              { name: 'status', dataTypeName: 'text' },
            ],
          },
        ],
      },
    ],
    'loaded',
    null,
    'pg',
  )
}

function builderSql() {
  const session = selectActiveSession(useStore.getState())
  const aggregation =
    session.builderVisualization.aggregation === 'count'
      ? 'count'
      : session.builderVisualization.aggregation
  const xColumn =
    session.builderVisualization.xColumn === 'time_bucket'
      ? session.builder.timeColumn
      : session.builderVisualization.xColumn
  const types = new Map([
    ['created_at', 'timestamptz'],
    ['country', 'text'],
    ['revenue', 'numeric'],
    ['status', 'text'],
  ])
  if (!session.builder.table || !xColumn) return ''
  return generateBuilderQuery({
    table: session.builder.table,
    xColumn,
    xColumnDataType: types.get(xColumn),
    timeColumn: session.builder.timeColumn,
    timeColumnDataType: session.builder.timeColumn
      ? types.get(session.builder.timeColumn)
      : undefined,
    timeBucket: session.builder.timeBucket,
    valueColumn:
      aggregation === 'count' ? null : session.builderVisualization.valueColumn,
    aggregation,
    seriesColumns: session.builder.seriesColumns,
    timeRange: session.builder.timeRange,
    filters: session.builderResultFilters,
  }).sql
}

async function askBuilder(prompt = 'sum revenue by country') {
  const input = await screen.findByRole('textbox', {
    name: 'Builder AI prompt',
  })
  fireEvent.change(input, { target: { value: prompt } })
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
  await waitFor(() => expect(mocks.proposeBuilder).toHaveBeenCalled())
}

test('Builder AI reviews structured changes before atomic Apply and never runs', async () => {
  setupBuilderAi()
  const before = selectActiveSession(useStore.getState())
  const beforeSql = builderSql()
  render(<AiBuilderCopilot />)
  await askBuilder()

  await screen.findByRole('button', { name: 'Apply' })
  const pending = selectActiveSession(useStore.getState())
  expect(pending.builder).toEqual(before.builder)
  expect(pending.builderVisualization).toEqual(before.builderVisualization)
  expect(builderSql()).toBe(beforeSql)
  expect(mocks.run).not.toHaveBeenCalled()

  const review = screen.getByRole('region', { name: 'AI Builder proposal' })
  expect(review.textContent).toContain('X axis')
  expect(review.textContent).toContain('created_at')
  expect(review.textContent).toContain('country')
  expect(review.textContent).toContain('Y axis')
  expect(review.textContent).toContain('revenue')
  expect(review.textContent).toContain('Aggregation')
  expect(review.textContent).toContain('Sum')

  const request = mocks.proposeBuilder.mock.calls[0][0]
  expect(request.state.relation).toEqual({ schema: 'public', name: 'orders' })
  expect(
    request.columns.map((column: { name: string }) => column.name),
  ).toEqual(
    expect.arrayContaining(['created_at', 'country', 'revenue', 'status']),
  )
  expect(JSON.stringify(request)).not.toMatch(
    /private-host|private-user|private-password/,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  const applied = selectActiveSession(useStore.getState())
  expect(applied.builderVisualization.xColumn).toBe('country')
  expect(applied.builderVisualization.valueColumn).toBe('revenue')
  expect(applied.builderVisualization.aggregation).toBe('sum')
  expect(applied.builderHasRun).toBe(false)
  expect(builderSql()).not.toBe(beforeSql)
  expect(builderSql()).toContain('SUM("revenue")')
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Builder AI reviews and applies manual-parity X/Y conflict normalization without running', async () => {
  setupBuilderAi()
  const initial = selectActiveSession(useStore.getState())
  patchActiveTestSession({
    builderVisualization: {
      ...initial.builderVisualization,
      xColumn: 'country',
      valueColumn: 'revenue',
      aggregation: 'sum',
      seriesColumn: null,
      seriesColumns: [],
    },
  })
  const before = selectActiveSession(useStore.getState())
  const beforeSql = builderSql()
  mocks.proposeBuilder.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: {
        patch: { xColumn: 'revenue' },
        explanation: 'Use revenue as the X axis.',
        assumptions: [],
      },
    } as AiBuilderStep),
  )

  render(<AiBuilderCopilot />)
  await askBuilder('use revenue as the X axis')

  const review = await screen.findByRole('region', {
    name: 'AI Builder proposal',
  })
  expect(review.textContent).toContain('X axis')
  expect(review.textContent).toContain('country')
  expect(review.textContent).toContain('revenue')
  expect(review.textContent).toContain('Y axis')
  expect(review.textContent).toContain('Aggregation')
  expect(review.textContent).toContain('Sum')
  expect(review.textContent).toContain('Count')
  expect(review.textContent).toContain('—')

  const pending = selectActiveSession(useStore.getState())
  expect(pending.builderVisualization).toEqual(before.builderVisualization)
  expect(builderSql()).toBe(beforeSql)
  expect(mocks.run).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

  const applied = selectActiveSession(useStore.getState())
  expect(applied.builderVisualization.xColumn).toBe('revenue')
  expect(applied.builderVisualization.valueColumn).toBeNull()
  expect(applied.builderVisualization.aggregation).toBe('count')
  expect(applied.builderHasRun).toBe(false)
  expect(builderSql()).not.toBe(beforeSql)
  expect(builderSql()).toContain('COUNT(*)')
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Builder AI normalizes a minimal Y-axis proposal through normal Builder defaults', async () => {
  setupBuilderAi()
  mocks.proposeBuilder.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: {
        patch: { valueColumn: 'revenue' },
        explanation: 'Use revenue as the Y axis.',
        assumptions: [],
      },
    } as AiBuilderStep),
  )
  render(<AiBuilderCopilot />)
  await askBuilder('use revenue as the Y axis')
  const review = await screen.findByRole('region', {
    name: 'AI Builder proposal',
  })
  expect(review.textContent).toContain('Y axis')
  expect(review.textContent).toContain('revenue')
  expect(review.textContent).toContain('Aggregation')
  expect(review.textContent).toContain('Sum')

  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  const session = selectActiveSession(useStore.getState())
  expect(session.builderVisualization.valueColumn).toBe('revenue')
  expect(session.builderVisualization.aggregation).toBe('sum')
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Builder AI accepts the exact ten-day hourly count request', async () => {
  setupBuilderAi()
  mocks.proposeBuilder.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: {
        patch: {
          timeBucket: 'hour',
          timeRange: { kind: 'rolling', amount: 10, unit: 'day' },
        },
        explanation: 'Count collections hourly over the last 10 days.',
        assumptions: [],
      },
    } as AiBuilderStep),
  )
  render(<AiBuilderCopilot />)
  await askBuilder('number of collections over the last 10 days grouped hourly')
  const review = await screen.findByRole('region', {
    name: 'AI Builder proposal',
  })
  expect(review.textContent).toContain('Time bucket')
  expect(review.textContent).toContain('Hour')
  expect(review.textContent).toContain('Last 10 days')
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  const session = selectActiveSession(useStore.getState())
  expect(session.builder.timeBucket).toBe('hour')
  expect(session.builder.timeRange).toEqual({
    kind: 'rolling',
    amount: 10,
    unit: 'day',
  })
  expect(builderSql()).toContain("INTERVAL '10 days'")
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Builder AI applies temporal controls while preserving a valid time column', async () => {
  setupBuilderAi()
  mocks.proposeBuilder.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: {
        patch: {
          valueColumn: 'revenue',
          aggregation: 'sum',
          timeBucket: 'week',
          timeRange: { kind: 'rolling', amount: 30, unit: 'day' },
        },
        explanation: 'Show weekly revenue for the last 30 days.',
        assumptions: [],
      },
    } as AiBuilderStep),
  )
  render(<AiBuilderCopilot />)
  await askBuilder('show weekly revenue for the last 30 days')
  fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
  const session = selectActiveSession(useStore.getState())
  expect(session.builder.timeColumn).toBe('created_at')
  expect(session.builder.timeBucket).toBe('week')
  expect(session.builder.timeRange).toEqual({
    kind: 'rolling',
    amount: 30,
    unit: 'day',
  })
  expect(session.builderVisualization.valueColumn).toBe('revenue')
  expect(session.builderVisualization.aggregation).toBe('sum')
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Builder AI Reject keeps Builder, generated SQL, and prompt unchanged', async () => {
  setupBuilderAi()
  const before = selectActiveSession(useStore.getState())
  const beforeSql = builderSql()
  render(<AiBuilderCopilot />)
  await askBuilder()
  fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
  const current = selectActiveSession(useStore.getState())
  expect(current.builder).toEqual(before.builder)
  expect(current.builderVisualization).toEqual(before.builderVisualization)
  expect(builderSql()).toBe(beforeSql)
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Builder AI prompt',
      }) as HTMLInputElement
    ).value,
  ).toBe('sum revenue by country')
  expect(mocks.run).not.toHaveBeenCalled()
})

test('Builder AI retry keeps the old review, disables Apply, and Cancel preserves it', async () => {
  setupBuilderAi()
  render(<AiBuilderCopilot />)
  await askBuilder()
  const firstApply = await screen.findByRole('button', { name: 'Apply' })
  expect((firstApply as HTMLButtonElement).disabled).toBe(false)

  const retry = deferred<AiResult<AiBuilderStep>>()
  mocks.proposeBuilder.mockReturnValueOnce(retry.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(
    screen.getByRole('region', { name: 'AI Builder proposal' }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(mocks.cancel).toHaveBeenCalled()
  expect(
    screen.getByRole('region', { name: 'AI Builder proposal' }),
  ).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
})

test('Builder AI successful retry replaces the previous proposal and failed retry preserves it', async () => {
  setupBuilderAi()
  render(<AiBuilderCopilot />)
  await askBuilder()
  await screen.findByRole('button', { name: 'Apply' })

  mocks.proposeBuilder.mockResolvedValueOnce({
    ok: false,
    code: 'provider',
    message: 'Temporary provider error.',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('alert')
  expect(
    screen.getByRole('region', { name: 'AI Builder proposal' }),
  ).toBeTruthy()

  mocks.proposeBuilder.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: {
        patch: { xColumn: 'status' },
        explanation: 'Group by status.',
        assumptions: [],
      },
    } as AiBuilderStep),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'AI Builder proposal' }).textContent,
    ).toContain('status'),
  )
})

test('Builder AI marks a visible proposal stale after manual Builder work', async () => {
  setupBuilderAi()
  render(<AiBuilderCopilot />)
  await askBuilder()
  await screen.findByRole('button', { name: 'Apply' })
  act(() =>
    useStore.getState().setVisualization('builder', { xColumn: 'status' }),
  )
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true),
  )
  expect(screen.getByText(/Builder controls changed/)).toBeTruthy()
})

for (const change of [
  'tab',
  'connection',
  'relation',
  'builder',
  'series',
] as const) {
  test(`Builder AI ignores a late proposal after a ${change} change`, async () => {
    setupBuilderAi()
    const pending = deferred<AiResult<AiBuilderStep>>()
    mocks.proposeBuilder.mockReturnValueOnce(pending.promise)
    render(<AiBuilderCopilot />)
    await askBuilder()
    const state = useStore.getState()
    act(() => {
      if (change === 'tab') {
        const other = createQuerySession(2)
        useStore.setState({
          tabs: [...state.tabs, other],
          activeTabId: other.id,
        })
      } else if (change === 'connection') {
        patchActiveTestSession({ connectionProfileId: 'other' })
      } else if (change === 'relation') {
        useStore
          .getState()
          .setBuilder({ table: { schema: 'public', name: 'other' } })
      } else if (change === 'builder') {
        useStore.getState().setVisualization('builder', { xColumn: 'status' })
      } else {
        useStore.getState().setBuilder({ seriesColumns: ['status'] })
      }
    })
    await act(async () =>
      pending.resolve(
        ok({
          kind: 'proposal',
          proposal: {
            patch: { xColumn: 'country' },
            explanation: 'Late proposal.',
            assumptions: [],
          },
        }),
      ),
    )
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  })
}

test('Builder AI shows unsupported requests without mutation or mode switching', async () => {
  setupBuilderAi()
  const before = selectActiveSession(useStore.getState())
  mocks.proposeBuilder.mockResolvedValueOnce(
    ok({
      kind: 'unsupported',
      reason: 'Joins are outside the current Builder capabilities.',
    } as AiBuilderStep),
  )
  render(<AiBuilderCopilot />)
  await askBuilder('join customers to orders')
  await screen.findByText(/can't be represented by the current Builder yet/)
  const current = selectActiveSession(useStore.getState())
  expect(current.queryMode).toBe('builder')
  expect(current.builder).toEqual(before.builder)
  expect(mocks.run).not.toHaveBeenCalled()
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Builder AI prompt',
      }) as HTMLInputElement
    ).value,
  ).toBe('join customers to orders')
})

test('Builder AI details expose only prompt, Builder state, selected metadata, explanation and assumptions', async () => {
  setupBuilderAi()
  mocks.proposeBuilder.mockResolvedValueOnce(
    ok({
      kind: 'proposal',
      proposal: {
        patch: { xColumn: 'country' },
        explanation: 'Use country on the X axis.',
        assumptions: ['Country values are the intended grouping.'],
      },
    } as AiBuilderStep),
  )
  render(<AiBuilderCopilot />)
  await askBuilder('group by country')
  await screen.findByRole('button', { name: 'Apply' })
  fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
  const response = await screen.findByRole('region', { name: 'AI response' })
  expect(response.textContent).toContain('Use country on the X axis.')
  expect(response.textContent).toContain(
    'Country values are the intended grouping.',
  )
  expect(screen.getByRole('region', { name: 'Prompt' }).textContent).toContain(
    'group by country',
  )
  expect(
    screen.getByRole('region', { name: 'Current Builder state' }).textContent,
  ).toContain('public.orders')
  expect(
    screen.getByRole('region', { name: 'Selected relation metadata' })
      .textContent,
  ).toContain('revenue numeric')
  expect(document.body.textContent).not.toMatch(
    /private-host|private-user|private-password/,
  )
})

test('Builder AI proposal state is transient and absent from workspace/session state', async () => {
  setupBuilderAi()
  render(<AiBuilderCopilot />)
  await askBuilder()
  await screen.findByRole('button', { name: 'Apply' })
  const persistedSessionShape = JSON.stringify(useStore.getState().tabs)
  expect(persistedSessionShape).not.toContain('sum revenue by country')
  expect(persistedSessionShape).not.toContain('Sum revenue by country.')
  expect(persistedSessionShape).not.toContain('"patch"')
})

test('Builder AI stays hidden until a PostgreSQL relation has loaded columns', async () => {
  patchActiveTestSession({
    queryMode: 'builder',
    builder: {
      table: null,
      timeColumn: null,
      timeBucket: 'day',
      seriesColumns: [],
    },
  })
  render(<AiBuilderCopilot />)
  expect(mocks.get).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('textbox', { name: 'Builder AI prompt' }),
  ).toBeNull()
})

test('Builder AI stays hidden when the selected relation has no usable columns', async () => {
  setupBuilderAi()
  setActiveTestMetadata(
    [
      {
        name: 'public',
        isSystem: false,
        relations: [
          {
            schema: 'public',
            name: 'orders',
            kind: 'r',
            qualifiedName: 'public.orders',
            columnsStatus: 'loaded',
            columns: [],
          },
        ],
      },
    ],
    'loaded',
    null,
    'pg',
  )
  render(<AiBuilderCopilot />)
  expect(mocks.get).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('textbox', { name: 'Builder AI prompt' }),
  ).toBeNull()
})
