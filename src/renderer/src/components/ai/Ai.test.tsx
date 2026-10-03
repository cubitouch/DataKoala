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
  cancel: vi.fn(),
  run: vi.fn(),
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
      cancel: mocks.cancel,
    },
    query: { run: mocks.run },
  },
}))
vi.mock('@components/query/QueryCodeEditor', () => ({
  QueryCodeEditor: ({ value }: { value: string }) => (
    <pre aria-label="Proposed SQL">{value}</pre>
  ),
}))
vi.mock('@lib/relationColumns', () => ({
  ensureRelationColumns: vi.fn(async () => [
    { name: 'id', dataTypeName: 'uuid' },
  ]),
}))
import { AiSettingsAction } from './AiSettingsAction'
import { AiSettingsModal } from './AiSettingsModal'
import { AiQueryAction } from './AiQueryAction'
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
import type { AiQueryProposal, AiResult } from '@shared/ai'
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
  mocks.propose.mockResolvedValue(ok(proposed))
  resetTestStore({
    profiles: [
      {
        id: 'pg',
        name: 'Postgres',
        kind: 'postgres',
        version: 1,
        host: 'private-host',
        port: 5432,
        database: 'db',
        user: 'private-user',
        password: 'private-password',
        ssl: false,
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
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Prompt' }), {
    target: { value: 'count orders' },
  })
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
}
test('sidebar menu opens settings and Escape restores focus', async () => {
  render(<AiSettingsAction />)
  const trigger = screen.getByRole('button', { name: 'App settings' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'AI settings…' }))
  expect(
    await screen.findByRole('dialog', { name: 'AI settings' }),
  ).toBeTruthy()
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
  expect(key.value).toBe('')
  expect(screen.getAllByText('saved/model').length).toBeGreaterThan(0)
  fireEvent.change(key, { target: { value: 'draft-placeholder' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  await screen.findByText(/Connection successful/)
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
  test(`proposal requires Use query and never executes; initial SQL: ${initialSql || 'empty'}`, async () => {
    patchActiveTestSession({ sql: initialSql })
    render(<AiQueryAction />)
    await generate()
    await screen.findByRole('button', { name: 'Use query' })
    expect(selectActiveSession(useStore.getState()).sql).toBe(initialSql)
    const request = mocks.propose.mock.calls[0][0]
    expect(request.currentQuery).toBe(initialSql || undefined)
    expect(JSON.stringify(request)).not.toMatch(
      /private-host|private-user|private-password/,
    )
    expect(request.context.relations[0].columns[0].name).toBe('id')
    fireEvent.click(screen.getByRole('button', { name: 'Use query' }))
    expect(selectActiveSession(useStore.getState()).sql).toBe(proposed.query)
    expect(mocks.run).not.toHaveBeenCalled()
  })
}
for (const change of ['query', 'tab', 'connection'] as const) {
  test(`stale ${change} change, even changed back, cannot apply proposal`, async () => {
    const pending = deferred<AiResult<AiQueryProposal>>()
    mocks.propose.mockReturnValue(pending.promise)
    render(<AiQueryAction />)
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
    await act(async () => pending.resolve(ok(proposed)))
    expect(
      (screen.getByRole('button', { name: 'Use query' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(selectActiveSession(useStore.getState()).sql).toBe('')
  })
}
test('Cancel aborts and ignores a late successful response', async () => {
  const pending = deferred<AiResult<AiQueryProposal>>()
  mocks.propose.mockReturnValue(pending.promise)
  render(<AiQueryAction />)
  await generate()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel generation' }))
  expect(mocks.cancel).toHaveBeenCalledWith(
    mocks.propose.mock.calls[0][0].requestId,
  )
  await act(async () => pending.resolve(ok(proposed)))
  expect(screen.queryByRole('button', { name: 'Use query' })).toBeNull()
  expect(selectActiveSession(useStore.getState()).sql).toBe('')
})
test('closing modal aborts its active request', async () => {
  mocks.propose.mockReturnValue(new Promise(() => {}))
  render(<AiQueryAction />)
  await generate()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(mocks.cancel).toHaveBeenCalledWith(
    mocks.propose.mock.calls[0][0].requestId,
  )
  expect(screen.queryByRole('dialog')).toBeNull()
})
test('provider errors remain visible and unconfigured copilot opens shared settings', async () => {
  mocks.propose.mockResolvedValue({
    ok: false,
    code: 'authentication',
    message: 'Check your API key.',
  })
  render(<AiQueryAction />)
  await generate()
  await screen.findByRole('alert')
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  expect(screen.getByRole('alert').textContent).toBe('Check your API key.')
  cleanup()
  mocks.get.mockResolvedValue(ok({ ...summary, hasApiKey: false }))
  render(<AiQueryAction />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open AI settings' }),
  )
  expect(
    await screen.findByRole('dialog', { name: 'AI settings' }),
  ).toBeTruthy()
})
