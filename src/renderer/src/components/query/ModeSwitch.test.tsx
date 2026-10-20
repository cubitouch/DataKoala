// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeSwitch } from './ModeSwitch'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
} from '@test/sessionTestUtils'
import { createQuerySession, useStore } from '@store/useStore'
import {
  parseWorkspaceDraft,
  serializeWorkspaceDraft,
} from '@lib/workspacePersistence'
import { workspaceRestorePatch } from '@lib/workspaceRestoration'

afterEach(() => {
  cleanup()
  resetTestStore()
})

describe('ModeSwitch Explain lock', () => {
  it.each([
    ['postgres', 'SQL'],
    ['bigquery', 'SQL'],
    ['local-files', 'SQL'],
    ['sqlite-file', 'SQL'],
    ['prometheus', 'PromQL'],
    ['tempo', 'TraceQL'],
    ['loki', 'LogQL'],
  ] as const)(
    'labels %s plain-query mode as %s before Builder',
    (kind, label) => {
      patchActiveTestSession({
        connectionProfileId: 'profile-1',
        queryMode: 'sql',
      })
      useStore.setState({
        profiles: [
          {
            id: 'profile-1',
            name: 'Test',
            kind,
            version: 1,
            readonly: true,
            transport:
              kind === 'tempo' || kind === 'loki'
                ? { kind: 'gcx', context: 'test' }
                : kind === 'prometheus'
                  ? { kind: 'grafana', baseUrl: '', datasourceUid: '' }
                  : {
                      kind: 'tcp',
                      host: '',
                      port: 5432,
                      database: '',
                      user: '',
                    },
          } as never,
        ],
      })
      render(<ModeSwitch />)
      const buttons = screen.getAllByRole('button')
      expect(buttons.map((button) => button.textContent)).toEqual([
        label,
        'Builder',
      ])
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(buttons[1])
      expect(activeTestSession().queryMode).toBe('builder')
    },
  )

  it('disables mode switching while Explain is active', () => {
    patchActiveTestSession({
      queryMode: 'sql',
      activeExplainRequest: 'explain',
    })
    render(<ModeSwitch />)

    const builder = screen.getByRole('button', { name: 'Builder' })
    expect(builder.hasAttribute('disabled')).toBe(true)
    expect(builder.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(builder)
    expect(activeTestSession().queryMode).toBe('sql')
  })
})

it('derives terminology from every restored tab and updates it after a profile switch', () => {
  const cases = [
    ['postgres', 'SQL'],
    ['bigquery', 'SQL'],
    ['local-files', 'SQL'],
    ['sqlite-file', 'SQL'],
    ['prometheus', 'PromQL'],
    ['loki', 'LogQL'],
    ['tempo', 'TraceQL'],
  ] as const
  // Profiles are resolved separately from workspace restoration, as in a cold launch.
  const profiles = cases.map(([kind]) => ({ id: kind, name: kind, kind }))
  const tabs = cases.map(([kind]) => ({
    ...createQuerySession(1, { id: 'tab-' + kind }),
    connectionProfileId: kind,
    queryMode: 'sql' as const,
    sql: 'untouched ' + kind,
  }))
  resetTestStore({ profiles: profiles as never, tabs, activeTabId: tabs[0].id })
  const serialized = serializeWorkspaceDraft(useStore.getState())
  const draft = parseWorkspaceDraft(serialized)!
  resetTestStore({
    profiles: profiles as never,
    ...workspaceRestorePatch(draft),
  })
  render(<ModeSwitch />)
  for (const [kind, language] of cases) {
    act(() => {
      void useStore.getState().activateTab('tab-' + kind)
    })
    const plain = screen.getByRole('button', { name: language })
    expect(plain.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Builder' }))
    expect(plain.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(plain)
    expect(activeTestSession().sql).toBe('untouched ' + kind)
  }
  // Same mounted control, different active profile: no stale TraceQL label.
  act(() => patchActiveTestSession({ connectionProfileId: 'loki' }))
  expect(screen.getByRole('button', { name: 'LogQL' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'TraceQL' })).toBeNull()
  expect(activeTestSession().sql).toBe('untouched tempo')
})
