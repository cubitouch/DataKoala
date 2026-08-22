import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeSwitch } from './ModeSwitch'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'

afterEach(() => { cleanup(); resetTestStore() })

describe('ModeSwitch Explain lock', () => {
  it.each([
    ['postgres', 'SQL'],
    ['prometheus', 'PromQL'],
    ['tempo', 'TraceQL']
  ] as const)('labels %s plain-query mode as %s before Builder', (kind, label) => {
    patchActiveTestSession({ connectionProfileId: 'profile-1', queryMode: 'sql' })
    useStore.setState({ profiles: [{ id: 'profile-1', name: 'Test', kind, version: 1, readonly: true, transport: kind === 'tempo' ? { kind: 'gcx', context: 'test' } : kind === 'prometheus' ? { kind: 'grafana', baseUrl: '', datasourceUid: '' } : { kind: 'tcp', host: '', port: 5432, database: '', user: '' } } as never] })
    render(<ModeSwitch />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([label, 'Builder'])
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(buttons[1])
    expect(activeTestSession().queryMode).toBe('builder')
  })

  it('disables mode switching while Explain is active', () => {
    patchActiveTestSession({ queryMode: 'sql', activeExplainRequest: 'explain' })
    render(<ModeSwitch />)

    const builder = screen.getByRole('button', { name: 'Builder' })
    expect(builder.hasAttribute('disabled')).toBe(true)
    expect(builder.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(builder)
    expect(activeTestSession().queryMode).toBe('sql')
  })
})
