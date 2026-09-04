import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TextInput } from '../ui/TextInput'
import { BuilderForm } from './BuilderForm'
import { BuilderRow } from './BuilderRow'
import { FormField } from './FormField'

afterEach(cleanup)

describe('builder layout primitives', () => {
  it('renders a semantic BuilderForm and forwards caller attributes', () => {
    render(<BuilderForm as="section" className="datasource-form" data-builder="example" aria-label="Query builder"><span>Builder content</span></BuilderForm>)
    const form = screen.getByRole('region', { name: 'Query builder' })
    expect(form.tagName).toBe('SECTION')
    expect(form.classList.contains('datasource-form')).toBe(true)
    expect(form.getAttribute('data-builder')).toBe('example')
    expect(screen.getByText('Builder content')).toBeTruthy()
  })

  it('renders BuilderRow children and forwards caller attributes', () => {
    render(<BuilderRow className="primary-row" data-row="primary"><span>Row content</span></BuilderRow>)
    const row = screen.getByText('Row content').parentElement!
    expect(row.classList.contains('primary-row')).toBe(true)
    expect(row.getAttribute('data-row')).toBe('primary')
  })

  it('contains shared inputs without introducing another accessible label', () => {
    render(<FormField className="wide-field"><TextInput label="Line contains" /></FormField>)
    const input = screen.getByRole('textbox', { name: 'Line contains' })
    expect(input.closest('.wide-field')).toBeTruthy()
    expect(screen.getAllByText('Line contains')).toHaveLength(1)
  })
})
