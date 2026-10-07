// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
const mocks = vi.hoisted(() => ({
  explain: vi.fn(),
  cancel: vi.fn(),
  prepare: vi.fn(),
  settings: vi.fn(),
  run: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    ai: {
      settings: { get: mocks.settings },
      explainQuery: mocks.explain,
      cancel: mocks.cancel,
    },
    query: { run: mocks.run },
  },
}))
vi.mock('@lib/ai/workflow', () => ({ prepareAiQueryContext: mocks.prepare }))
import { AiQueryExplanation } from './AiQueryExplanation'
import { AiExplainAction } from './AiExplainAction'
import { ExplainPane } from '@components/query/sql/ExplainPane'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
} from '@test/sessionTestUtils'
import type { AiQueryExplanation as Explanation } from '@shared/ai'
const snapshot = {
  tabId: 'tab',
  profileId: 'pg',
  query: 'SELECT * FROM orders WHERE total > 0',
}
const context = {
  language: { kind: 'sql', dialect: 'postgres' },
  relations: [],
}
const result: Explanation = {
  summary: 'Orders with positive totals.',
  assumptions: [],
  nodes: [
    {
      id: 'orders',
      label: 'Orders',
      kind: 'source',
      sqlFragment: 'FROM orders',
    },
    {
      id: 'filter',
      label: 'Positive total',
      kind: 'filter',
      sqlFragment: 'WHERE total > 0',
    },
  ],
  edges: [{ from: 'orders', to: 'filter' }],
  highlights: [
    {
      title: 'Positive orders',
      detail: 'Keeps positive totals.',
      nodeIds: ['filter'],
    },
  ],
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { resolve, promise }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.settings.mockResolvedValue({
    ok: true,
    value: { model: 'model', hasApiKey: true, provider: 'openrouter' },
  })
  mocks.cancel.mockResolvedValue({ ok: true })
  mocks.prepare.mockImplementation(async (s) => ({
    snapshot: s,
    prompt: '',
    context,
  }))
  mocks.explain.mockResolvedValue({ ok: true, value: result })
  resetTestStore({
    profiles: [
      {
        id: 'pg',
        name: 'PG',
        kind: 'postgres',
        version: 2,
        host: 'localhost',
        port: 5432,
        database: 'db',
        user: 'user',
        password: '',
        tlsMode: 'disable',
        readonly: true,
      },
    ],
  })
  patchActiveTestSession({ connectionProfileId: 'pg', sql: snapshot.query })
})
afterEach(cleanup)
it('prepares lazily, links diagram/highlights to SQL, and never executes SQL', async () => {
  render(<AiQueryExplanation snapshot={snapshot} />)
  expect(mocks.prepare).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI diagram' }))
  await screen.findByText(result.summary)
  expect(mocks.explain).toHaveBeenCalledWith({
    requestId: expect.any(String),
    currentQuery: snapshot.query,
    context,
  })
  fireEvent.click(screen.getByRole('button', { name: /source Orders/ }))
  expect(
    screen.getByLabelText('Explained SQL').querySelector('mark')?.textContent,
  ).toBe('FROM orders')
  fireEvent.click(screen.getByRole('button', { name: /Positive orders/ }))
  expect(
    screen.getByLabelText('Explained SQL').querySelector('mark')?.textContent,
  ).toBe('WHERE total > 0')
  expect(mocks.run).not.toHaveBeenCalled()
})
it('ignores late responses after cancellation and allows retry', async () => {
  const pending = deferred<{ ok: true; value: Explanation }>()
  mocks.explain.mockReturnValueOnce(pending.promise)
  render(<AiQueryExplanation snapshot={snapshot} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI diagram' }))
  await waitFor(() => expect(mocks.explain).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await act(async () => pending.resolve({ ok: true, value: result }))
  expect(screen.queryByText(result.summary)).toBeNull()
  expect(mocks.cancel).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI diagram' }))
  await screen.findByText(result.summary)
})
it('does not send after cancellation during metadata preparation', async () => {
  const pending = deferred<{
    snapshot: typeof snapshot
    prompt: string
    context: typeof context
  }>()
  mocks.prepare.mockReturnValueOnce(pending.promise)
  const view = render(<AiQueryExplanation snapshot={snapshot} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI diagram' }))
  view.unmount()
  await act(async () => pending.resolve({ snapshot, prompt: '', context }))
  expect(mocks.explain).not.toHaveBeenCalled()
})
it('cancels when the explanation surface closes', async () => {
  mocks.explain.mockReturnValue(new Promise(() => {}))
  const view = render(<AiQueryExplanation snapshot={snapshot} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI diagram' }))
  await waitFor(() => expect(mocks.explain).toHaveBeenCalledOnce())
  view.unmount()
  expect(mocks.cancel).toHaveBeenCalledOnce()
})
for (const mode of ['explain', 'analyze'] as const)
  it(`supports ${mode} with the captured SQL even after editor changes`, async () => {
    patchActiveTestSession({
      showExplain: true,
      explainText: 'Database output',
      explainSnapshot: { query: snapshot.query, mode },
      sql: 'SELECT 42',
    })
    render(<ExplainPane />)
    expect(screen.getByText('Database output')).toBeTruthy()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Generate AI diagram' }),
    )
    await screen.findByText(result.summary)
    expect(mocks.explain.mock.calls[0][0].currentQuery).toBe(snapshot.query)
    expect(screen.getByText(/The editor has changed/)).toBeTruthy()
    expect(mocks.run).not.toHaveBeenCalled()
  })
it('opens a semantic explanation from the editor without running the database or calling AI automatically', async () => {
  render(
    <>
      <AiExplainAction disabled={false} />
      <ExplainPane />
    </>,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: 'Explain Query with AI' }),
  )
  await screen.findByRole('button', { name: 'Generate AI diagram' })
  expect(activeTestSession().explainSnapshot).toEqual({
    query: snapshot.query,
    mode: 'semantic',
  })
  expect(mocks.explain).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
})
it('keeps database plans available without AI configuration', async () => {
  mocks.settings.mockResolvedValue({
    ok: true,
    value: { model: '', hasApiKey: false },
  })
  patchActiveTestSession({
    showExplain: true,
    explainText: 'Plan without AI',
    explainSnapshot: { query: snapshot.query, mode: 'analyze' },
  })
  render(
    <>
      <AiExplainAction disabled={false} />
      <ExplainPane />
    </>,
  )
  await act(async () => {})
  expect(screen.getByText('Plan without AI')).toBeTruthy()
  expect(
    screen.queryByRole('button', { name: 'Generate AI diagram' }),
  ).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Explain Query with AI' }),
  ).toBeNull()
})
