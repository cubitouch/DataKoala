import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeSwitch } from './ModeSwitch'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

afterEach(() => { cleanup(); resetTestStore() })

describe('ModeSwitch Explain lock', () => {
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
