import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QueryToolbar } from './QueryToolbar'

describe('QueryToolbar', () => {
  it('keeps the standard slot ordering and supports optional datasource slots', () => {
    const { container } = render(<QueryToolbar
      modeControl={<button>Mode</button>}
      queryOptions={<button>Options</button>}
      utilityActions={<button>Reset</button>}
      editorActions={<button>Format</button>}
      executionAction={<button disabled>Run</button>}
    />)
    expect(container.querySelector('[data-query-toolbar]')?.textContent).toBe('ModeOptionsResetFormatRun')
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('omits optional groups without changing the mode/run contract', () => {
    render(<QueryToolbar modeControl={<span>Query</span>} executionAction={<button>Run</button>} />)
    expect(screen.getByText('Query')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()
  })
})
