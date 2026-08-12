import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BigQueryProfile } from '../../../shared/types'

const mocks = vi.hoisted(() => ({ discoverProjects: vi.fn(), discoverDefaults: vi.fn(), listDatasets: vi.fn(), test: vi.fn(), upsert: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { ...mocks, bigquery: { discoverProjects: mocks.discoverProjects, discoverDefaults: mocks.discoverDefaults, listDatasets: mocks.listDatasets } } } }))
import { ConnectionModal } from './ConnectionModal'

const renderBigQuery = (existing: BigQueryProfile | null = null) => {
  render(<ConnectionModal existing={existing} onClose={vi.fn()} onSaved={vi.fn()} />)
  if (!existing) fireEvent.click(screen.getByRole('button', { name: 'BigQuery' }))
}

beforeEach(() => {
  mocks.discoverProjects.mockReset().mockResolvedValue([]); mocks.discoverDefaults.mockReset().mockResolvedValue({})
  mocks.listDatasets.mockReset().mockResolvedValue([]); mocks.test.mockReset(); mocks.upsert.mockReset()
})
afterEach(cleanup)

it('surfaces discovered project, dataset friendly name, and location', async () => {
  mocks.discoverProjects.mockResolvedValue([{ projectId: 'analytics-prod', friendlyName: 'My analytics project' }])
  mocks.listDatasets.mockResolvedValue([{ projectId: 'analytics-prod', datasetId: 'events', friendlyName: 'Analytics events', location: 'EU' }])
  renderBigQuery()
  fireEvent.click(await screen.findByRole('combobox', { name: /Data project/ })); fireEvent.click(await screen.findByText('My analytics project'))
  await waitFor(() => expect(mocks.listDatasets).toHaveBeenCalledWith('analytics-prod'))
  fireEvent.click(screen.getByRole('combobox', { name: /Dataset/ })); expect(await screen.findByText('Analytics events · EU')).toBeTruthy()
  fireEvent.click(screen.getByText('events')); expect((await screen.findByText(/Dataset location:/)).textContent).toContain('EU')
})

it('does not overwrite an existing profile with ADC defaults', async () => {
  mocks.discoverDefaults.mockResolvedValue({ projectId: 'adc-project' })
  renderBigQuery({ kind: 'bigquery', version: 1, id: 'bq', name: 'Saved', billingProject: 'saved-billing', defaultProject: 'saved-data', defaultDataset: 'saved', maximumBytesBilled: '1000', readonly: true })
  await Promise.resolve()
  expect(screen.getByRole('combobox', { name: /Billing project/ }).textContent).toContain('saved-billing')
  expect(screen.getByRole('combobox', { name: /Data project/ }).textContent).toContain('saved-data')
})

it('applies valid pasted references while malformed input is non-destructive', async () => {
  renderBigQuery(); const input = screen.getByLabelText(/Paste BigQuery reference/)
  fireEvent.change(input, { target: { value: 'bad..reference' } }); expect(await screen.findByText(/valid BigQuery/)).toBeTruthy()
  expect(screen.getByRole('combobox', { name: /Data project/ }).textContent).not.toContain('bad')
  fireEvent.change(input, { target: { value: '`new-project.events.table`' } })
  expect(screen.getByRole('combobox', { name: /Data project/ }).textContent).toContain('new-project')
  expect(screen.getByRole('combobox', { name: /Dataset/ }).textContent).toContain('events')
})

it('manual unlisted projects work and stale dataset results cannot win', async () => {
  let resolveA!: (value: unknown[]) => void
  mocks.listDatasets.mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve })).mockResolvedValueOnce([{ projectId: 'project-b', datasetId: 'current' }])
  renderBigQuery(); const project = screen.getByRole('combobox', { name: /Data project/ })
  fireEvent.click(project); fireEvent.change(screen.getByLabelText('Search Data project'), { target: { value: 'project-a' } }); fireEvent.click(screen.getByText('Use “project-a”'))
  fireEvent.click(project); fireEvent.change(screen.getByLabelText('Search Data project'), { target: { value: 'project-b' } }); fireEvent.click(screen.getByText('Use “project-b”'))
  await waitFor(() => expect(mocks.listDatasets).toHaveBeenCalledWith('project-b')); resolveA([{ projectId: 'project-a', datasetId: 'stale' }]); await Promise.resolve()
  fireEvent.click(screen.getByRole('combobox', { name: /Dataset/ })); expect(screen.queryByText('stale')).toBeNull(); expect(await screen.findByText('current')).toBeTruthy()
})
