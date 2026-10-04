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
vi.mock('@lib/relationColumns', () => ({
  ensureRelationColumns: vi.fn(async () => [
    { name: 'id', dataTypeName: 'uuid' },
  ]),
}))
import { AiSettingsAction } from './AiSettingsAction'
import { AiSettingsModal } from './AiSettingsModal'
import { AiQueryCopilot } from './AiQueryCopilot'
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
test('sidebar button opens settings directly and Escape restores focus', async () => {
  render(<AiSettingsAction />)
  const trigger = screen.getByRole('button', { name: 'Settings' })
  fireEvent.click(trigger)
  expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy()
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
    const pending = deferred<AiResult<AiQueryProposal>>()
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
    await act(async () => pending.resolve(ok(proposed)))
    expect(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(selectActiveSession(useStore.getState()).sql).toBe('')
  })
}
test('Cancel aborts and ignores a late successful response', async () => {
  const pending = deferred<AiResult<AiQueryProposal>>()
  mocks.propose.mockReturnValue(pending.promise)
  render(<AiQueryCopilot />)
  await generate()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(mocks.cancel).toHaveBeenCalledWith(
    mocks.propose.mock.calls[0][0].requestId,
  )
  await act(async () => pending.resolve(ok(proposed)))
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
test('provider errors remain visible and unconfigured copilot opens shared settings', async () => {
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
  mocks.get.mockResolvedValue(ok({ ...summary, hasApiKey: false }))
  render(<AiQueryCopilot />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open AI settings' }),
  )
  expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy()
})

test('inline composer submits on Enter, reports loading, and prevents parent Run shortcuts', async () => {
  mocks.propose.mockReturnValue(new Promise(() => {}))
  const parentShortcut = vi.fn()
  render(
    <div onKeyDown={parentShortcut}>
      <AiQueryCopilot />
    </div>,
  )
  const input = screen.getByRole('textbox', { name: 'AI prompt' })
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
test('diff stays inline and reasoning opens a modal; Reject keeps SQL and prompt', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Reasoning' }))
  expect(screen.getByRole('dialog', { name: 'AI reasoning' })).toBeTruthy()
  expect(screen.getByText(proposed.explanation)).toBeTruthy()
  expect(screen.getByText(proposed.assumptions[0])).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reasoning' }))
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), {
    key: 'Escape',
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Reasoning' }),
    ),
  )
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
test('Try again keeps previous diff pending, uses latest SQL and replaces only on response', async () => {
  render(<AiQueryCopilot />)
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
  act(() => patchActiveTestSession({ sql: 'SELECT id FROM public.orders' }))
  const pending = deferred<AiResult<AiQueryProposal>>()
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
    pending.resolve(ok({ ...proposed, explanation: 'Updated proposal' })),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reasoning' }))
  expect(screen.getByText('Updated proposal')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(
    (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
})
test('context popover discloses current SQL and metadata before and after generation', async () => {
  patchActiveTestSession({ sql: 'SELECT id FROM public.orders' })
  render(<AiQueryCopilot />)
  fireEvent.change(screen.getByRole('textbox', { name: 'AI prompt' }), {
    target: { value: 'count orders' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'View AI context' }))
  await screen.findByText(/public.orders\s+id uuid/)
  expect(screen.getByRole('region', { name: 'Current SQL' })).toBeTruthy()
  expect(screen.getByText('About this request')).toBeTruthy()
  expect(screen.getByText('Request content')).toBeTruthy()
  expect(screen.getByText('SELECT id FROM public.orders')).toBeTruthy()
  expect(
    screen.getByText(/Database credentials and query result rows are not sent/),
  ).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Current SQL' })).toBeNull()
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
  fireEvent.click(screen.getByRole('button', { name: 'View AI context' }))
  expect(screen.getByText(/Submitted context/)).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Prompt' }).textContent).toContain(
    'count orders',
  )
})

test('saving settings from the sidebar enables an already-mounted composer', async () => {
  mocks.get.mockResolvedValue(ok({ ...summary, hasApiKey: false }))
  render(<AiQueryCopilot />)
  await screen.findByText('Configure OpenRouter to use Ask AI.')
  mocks.get.mockResolvedValue(ok(summary))
  act(() => window.dispatchEvent(new Event('datakoala:ai-settings-changed')))
  await waitFor(() =>
    expect(
      screen.queryByText('Configure OpenRouter to use Ask AI.'),
    ).toBeNull(),
  )
  await generate()
  await screen.findByRole('button', { name: 'Apply' })
})
test('cancelled first response cannot replace a newer proposal', async () => {
  const first = deferred<AiResult<AiQueryProposal>>()
  mocks.propose
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(ok({ ...proposed, explanation: 'Newer proposal' }))
  render(<AiQueryCopilot />)
  await generate()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reasoning' }))
  await screen.findByText('Newer proposal')
  await act(async () =>
    first.resolve(ok({ ...proposed, explanation: 'Cancelled proposal' })),
  )
  expect(screen.queryByText('Cancelled proposal')).toBeNull()
  expect(screen.getByText('Newer proposal')).toBeTruthy()
})
