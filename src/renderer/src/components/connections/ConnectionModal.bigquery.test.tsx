// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { BigQueryProfile } from '@shared/types'

const mocks = vi.hoisted(() => ({
  discoverProjects: vi.fn(),
  discoverDefaults: vi.fn(),
  listDatasets: vi.fn(),
  test: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    connections: {
      ...mocks,
      bigquery: {
        discoverProjects: mocks.discoverProjects,
        discoverDefaults: mocks.discoverDefaults,
        listDatasets: mocks.listDatasets,
      },
    },
  },
}))
import { BigQueryConnectionModal as ConnectionModal } from './BigQueryConnectionModal'

const renderBigQuery = (existing: BigQueryProfile | null = null) => {
  const onSaved = vi.fn()
  render(
    <ConnectionModal existing={existing} onClose={vi.fn()} onSaved={onSaved} />,
  )
  return { onSaved }
}

beforeEach(() => {
  mocks.discoverProjects.mockReset().mockResolvedValue([])
  mocks.discoverDefaults.mockReset().mockResolvedValue({})
  mocks.listDatasets.mockReset().mockResolvedValue([])
  mocks.test.mockReset()
  mocks.upsert.mockReset().mockImplementation(async (profile) => profile)
})
afterEach(cleanup)

it('places the static ADC helper after Advanced and before actions', () => {
  renderBigQuery()
  const advanced = screen.getByText('Advanced').closest('details')!
  const helper = screen.getByText(
    /Authentication uses Google Application Default Credentials/,
  )
  const testButton = screen.getByRole('button', { name: 'Test' })
  expect(
    advanced.compareDocumentPosition(helper) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(
    helper.compareDocumentPosition(testButton) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

it('allows a blank billing cap when saving', async () => {
  const { onSaved } = renderBigQuery()
  fireEvent.change(screen.getByLabelText('Connection name'), {
    target: { value: 'Warehouse' },
  })
  fireEvent.click(screen.getByRole('combobox', { name: /Billing project/ }))
  fireEvent.change(screen.getByLabelText('Search Billing project'), {
    target: { value: 'billing' },
  })
  fireEvent.click(screen.getByText('Use “billing”'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ maximumBytesBilled: '' }),
  )
})

it('explicitly switches capped to uncapped and restores the prior cap', async () => {
  renderBigQuery({
    kind: 'bigquery',
    version: 1,
    id: 'bq',
    name: 'Saved',
    billingProject: 'billing',
    maximumBytesBilled: '1073741824',
    readonly: true,
  })
  fireEvent.click(screen.getByText('Advanced'))
  const toggle = screen.getByRole('checkbox', {
    name: /Limit bytes billed/,
  }) as HTMLInputElement
  const input = screen.getByLabelText(
    'Maximum bytes billed',
  ) as HTMLInputElement
  expect(toggle.checked).toBe(true)
  expect(input.value).toBe('1073741824')
  fireEvent.click(toggle)
  expect(input.disabled).toBe(true)
  fireEvent.click(toggle)
  expect(input.value).toBe('1073741824')
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ maximumBytesBilled: '' }),
    ),
  )
})

it('requires a positive integer only when the explicit cap is enabled', async () => {
  renderBigQuery({
    kind: 'bigquery',
    version: 1,
    id: 'bq',
    name: 'Saved',
    billingProject: 'billing',
    maximumBytesBilled: '',
    readonly: true,
  })
  fireEvent.click(screen.getByText('Advanced'))
  fireEvent.click(screen.getByRole('checkbox', { name: /Limit bytes billed/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(
    await screen.findByText(
      'Maximum bytes billed must be a positive decimal integer.',
    ),
  ).toBeTruthy()
})

it('surfaces discovered project, dataset friendly name, and location', async () => {
  mocks.discoverProjects.mockResolvedValue([
    { projectId: 'analytics-prod', friendlyName: 'My analytics project' },
  ])
  mocks.listDatasets.mockResolvedValue([
    {
      projectId: 'analytics-prod',
      datasetId: 'events',
      friendlyName: 'Analytics events',
      location: 'EU',
    },
  ])
  renderBigQuery()
  fireEvent.click(await screen.findByRole('combobox', { name: /Data project/ }))
  fireEvent.click(await screen.findByText('My analytics project'))
  await waitFor(() =>
    expect(mocks.listDatasets).toHaveBeenCalledWith('analytics-prod'),
  )
  fireEvent.click(screen.getByRole('combobox', { name: /Dataset/ }))
  expect(await screen.findByText('Analytics events · EU')).toBeTruthy()
  fireEvent.click(screen.getByText('events'))
  expect((await screen.findByText(/Dataset location:/)).textContent).toContain(
    'EU',
  )
})

it('does not overwrite an existing profile with ADC defaults', async () => {
  mocks.discoverDefaults.mockResolvedValue({ projectId: 'adc-project' })
  renderBigQuery({
    kind: 'bigquery',
    version: 1,
    id: 'bq',
    name: 'Saved',
    billingProject: 'saved-billing',
    defaultProject: 'saved-data',
    defaultDataset: 'saved',
    maximumBytesBilled: '1000',
    readonly: true,
  })
  await Promise.resolve()
  expect(
    screen.getByRole('combobox', { name: /Billing project/ }).textContent,
  ).toContain('saved-billing')
  expect(
    screen.getByRole('combobox', { name: /Data project/ }).textContent,
  ).toContain('saved-data')
  expect(
    screen.getByRole('combobox', { name: /Dataset/ }).textContent,
  ).toContain('saved')
})

it('defaults to all datasets and clears a selected default before saving', async () => {
  mocks.discoverDefaults.mockResolvedValue({ projectId: 'data' })
  const { onSaved } = renderBigQuery()
  expect(
    (await screen.findByRole('combobox', { name: /Dataset/ })).textContent,
  ).toContain('All datasets')
  fireEvent.change(screen.getByLabelText('Connection name'), {
    target: { value: 'Warehouse' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mocks.upsert.mock.calls[0][0].defaultDataset).toBeUndefined()

  cleanup()
  mocks.listDatasets.mockResolvedValue([
    { projectId: 'data', datasetId: 'analytics' },
  ])
  renderBigQuery({
    kind: 'bigquery',
    version: 1,
    id: 'bq',
    name: 'Saved',
    billingProject: 'billing',
    defaultProject: 'data',
    defaultDataset: 'analytics',
    maximumBytesBilled: '1000',
    readonly: true,
  })
  const dataset = screen.getByRole('combobox', { name: /Dataset/ })
  expect(dataset.textContent).toContain('analytics')
  fireEvent.click(dataset)
  fireEvent.click(await screen.findByRole('option', { name: /All datasets/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(mocks.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultDataset: undefined }),
    ),
  )
})

it('changing data project resets a selected dataset to all datasets', async () => {
  mocks.discoverProjects.mockResolvedValue([
    { projectId: 'project-a' },
    { projectId: 'project-b' },
  ])
  renderBigQuery({
    kind: 'bigquery',
    version: 1,
    id: 'bq',
    name: 'Saved',
    billingProject: 'project-a',
    defaultProject: 'project-a',
    defaultDataset: 'analytics',
    maximumBytesBilled: '1000',
    readonly: true,
  })
  const project = await screen.findByRole('combobox', { name: /Data project/ })
  fireEvent.click(project)
  fireEvent.click(await screen.findByRole('option', { name: 'project-b' }))
  expect(
    screen.getByRole('combobox', { name: /Dataset/ }).textContent,
  ).toContain('All datasets')
})

it('applies valid pasted references while malformed input is non-destructive', async () => {
  renderBigQuery()
  const input = screen.getByLabelText(/Paste BigQuery reference/)
  fireEvent.change(input, { target: { value: 'bad..reference' } })
  expect(await screen.findByText(/valid BigQuery/)).toBeTruthy()
  expect(
    screen.getByRole('combobox', { name: /Data project/ }).textContent,
  ).not.toContain('bad')
  fireEvent.change(input, { target: { value: '`new-project.events.table`' } })
  expect(
    screen.getByRole('combobox', { name: /Data project/ }).textContent,
  ).toContain('new-project')
  expect(
    screen.getByRole('combobox', { name: /Dataset/ }).textContent,
  ).toContain('events')
})

it('manual unlisted projects work and stale dataset results cannot win', async () => {
  let resolveA!: (value: unknown[]) => void
  mocks.listDatasets
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve
        }),
    )
    .mockResolvedValueOnce([{ projectId: 'project-b', datasetId: 'current' }])
  renderBigQuery()
  const project = screen.getByRole('combobox', { name: /Data project/ })
  fireEvent.click(project)
  fireEvent.change(screen.getByLabelText('Search Data project'), {
    target: { value: 'project-a' },
  })
  fireEvent.click(screen.getByText('Use “project-a”'))
  fireEvent.click(project)
  fireEvent.change(screen.getByLabelText('Search Data project'), {
    target: { value: 'project-b' },
  })
  fireEvent.click(screen.getByText('Use “project-b”'))
  await waitFor(() =>
    expect(mocks.listDatasets).toHaveBeenCalledWith('project-b'),
  )
  resolveA([{ projectId: 'project-a', datasetId: 'stale' }])
  await Promise.resolve()
  fireEvent.click(screen.getByRole('combobox', { name: /Dataset/ }))
  expect(screen.queryByText('stale')).toBeNull()
  expect(await screen.findByText('current')).toBeTruthy()
})

it('retains actionable discovery guidance after IPC cleanup and permits manual project entry', async () => {
  const guidance =
    'BigQuery authentication has expired or was revoked. Renew Google Application Default Credentials, then reconnect.'
  mocks.discoverProjects.mockRejectedValueOnce(
    new Error(
      `Error invoking remote method 'bigquery:discover-projects': Error: ${guidance}`,
    ),
  )
  renderBigQuery()
  await screen.findAllByText(new RegExp('authentication has expired'))
  expect(document.body.textContent).not.toContain(
    'Error invoking remote method',
  )
  expect(document.body.textContent).toContain(
    'You can still enter a project ID manually.',
  )
  const name = screen.getByRole('textbox', { name: 'Connection name' })
  fireEvent.change(name, { target: { value: 'Retry BQ' } })
  expect((name as HTMLInputElement).value).toBe('Retry BQ')
})

it('shows provider test guidance once and permits retry without resetting the draft', async () => {
  const guidance =
    'BigQuery billing-project configuration failed. Check Billing project and its active billing account.'
  mocks.test
    .mockResolvedValueOnce({ ok: false, error: guidance })
    .mockResolvedValueOnce({ ok: true })
  renderBigQuery({
    kind: 'bigquery',
    version: 1,
    id: 'demo',
    name: 'Demo',
    billingProject: 'demo-billing',
    defaultProject: 'demo-data',
    maximumBytesBilled: '',
    readonly: true,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Test' }))
  await screen.findByText(guidance)
  expect(screen.getAllByText(guidance)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Test' }))
  await screen.findByText('Credentials and metadata access verified.')
  expect(mocks.test).toHaveBeenCalledTimes(2)
  expect(mocks.test.mock.calls[0]).toEqual(mocks.test.mock.calls[1])
})

it('surfaces dataset permission guidance and strips transport wrappers', async () => {
  mocks.listDatasets.mockRejectedValueOnce(
    new Error(
      "Error invoking remote method 'bigquery:list-datasets': Error: BigQuery permission denied. Check dataset read permissions in Data project.",
    ),
  )
  renderBigQuery({
    kind: 'bigquery',
    version: 1,
    id: 'demo',
    name: 'Demo',
    billingProject: 'demo-billing',
    defaultProject: 'demo-data',
    maximumBytesBilled: '',
    readonly: true,
  })
  await screen.findByText(/BigQuery permission denied.*dataset ID manually/)
  expect(document.body.textContent).not.toContain('remote method')
})
