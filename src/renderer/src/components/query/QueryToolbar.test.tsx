import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QueryToolbar } from './QueryToolbar'

describe('QueryToolbar', () => {
  it('renders supplied slots in the standard order', () => {
    const { container } = render(<QueryToolbar mode={<span>mode</span>} options={<span>options</span>} utilities={<span>utilities</span>} editorActions={<span>actions</span>} execution={<span>run</span>} />)
    expect(container.querySelector('[data-query-toolbar]')?.textContent).toBe('modeoptionsutilitiesactionsrun')
    expect(container.querySelectorAll('.query-toolbar-group')).toHaveLength(5)
  })

  it('omits absent groups while retaining the responsive spacer', () => {
    const { container } = render(<QueryToolbar mode={<span>mode</span>} execution={<span>run</span>} />)
    expect(container.querySelectorAll('.query-toolbar-group')).toHaveLength(2)
    expect(container.querySelectorAll('.spacer')).toHaveLength(1)
  })

  it('forwards class, data, and ARIA hooks', () => {
    render(<QueryToolbar className="datasource-toolbar" data-preview="query" aria-label="Query controls" execution={<button>Run</button>} />)
    const toolbar = screen.getByLabelText('Query controls')
    expect(toolbar.classList.contains('datasource-toolbar')).toBe(true)
    expect(toolbar.hasAttribute('data-query-toolbar')).toBe(true)
    expect(toolbar.getAttribute('data-preview')).toBe('query')
  })
})
