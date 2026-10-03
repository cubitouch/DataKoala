import { describe, expect, it, vi } from 'vitest'
import { queryErrorMessage, withQueryErrors } from '@lib/queryErrors'

describe('queryErrorMessage', () => {
  it.each([
    [
      new Error(
        "Error invoking remote method 'query:run': Error: Error: Syntax error at [2:7]",
      ),
      'Syntax error at [2:7]',
    ],
    [
      'Error invoking remote method "query:run-loki": Error: parse error at line 1, col 9',
      'parse error at line 1, col 9',
    ],
    [
      new Error(
        "Error invoking remote method 'query:run': Error: Error invoking remote method 'inner': Error: Permission denied",
      ),
      'Permission denied',
    ],
    [
      { message: 'Error: Connection lost. Reconnect and try again.' },
      'Connection lost. Reconnect and try again.',
    ],
    [
      new Error('Access denied: project.dataset.table\nLocation: EU'),
      'Access denied: project.dataset.table\nLocation: EU',
    ],
    [
      'Backend returned Error: invalid label',
      'Backend returned Error: invalid label',
    ],
  ])(
    'preserves datasource details after stripping leading wrappers',
    (error, expected) => {
      expect(queryErrorMessage(error)).toBe(expected)
    },
  )

  it.each(['SCRIPT', 'INSERT', 'a script or unsupported statement'])(
    'makes BigQuery %s validation actionable',
    (statementType) => {
      const raw = new Error(
        `Error invoking remote method 'query:run': Error: BigQuery is read-only: only one SELECT statement is allowed (received ${statementType}).`,
      )
      expect(queryErrorMessage(raw)).toBe(
        'BigQuery connections are read-only. Use SELECT queries or DECLARE/SET scripts ending with a SELECT; write statements are not supported.',
      )
    },
  )

  it.each([
    undefined,
    null,
    {},
    42,
    '',
    new Error(''),
    "Error invoking remote method 'query:run': Error: ",
  ])('has a fallback for empty or unknown errors', (error) => {
    expect(queryErrorMessage(error)).toBe(
      'The query could not be completed. Please try again.',
    )
  })
})

describe('withQueryErrors', () => {
  it('preserves successful results', async () => {
    const result = { rows: [{ value: 1 }] }
    expect(await withQueryErrors(async () => result)).toBe(result)
  })

  it('preserves the raw error in diagnostics and cause', async () => {
    const raw = new Error(
      "Error invoking remote method 'query:run': Error: Invalid query",
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      withQueryErrors(async () => {
        throw raw
      }),
    ).rejects.toMatchObject({ message: 'Invalid query', cause: raw })
    expect(log).toHaveBeenCalledWith('Query execution failed', raw)
  })
})
