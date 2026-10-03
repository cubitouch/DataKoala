const fallbackMessage = 'The query could not be completed. Please try again.'

export function queryErrorMessage(error: unknown): string {
  let message =
    typeof error === 'string'
      ? error
      : error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : ''

  // Only remove leading transport/error wrappers; keep datasource details intact.
  let previous: string
  do {
    previous = message
    message = message
      .trim()
      .replace(/^Error invoking remote method (?:'[^']*'|"[^"]*"):\s*/, '')
      .replace(/^Error:\s*/, '')
  } while (message !== previous)

  if (
    /^BigQuery is read-only: only one SELECT statement is allowed(?: \(received [^)]+\))?\.?$/.test(
      message,
    )
  ) {
    return 'BigQuery connections are read-only. Use SELECT queries or DECLARE/SET scripts ending with a SELECT; write statements are not supported.'
  }
  return message || fallbackMessage
}

export async function withQueryErrors<T>(
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await execute()
  } catch (error) {
    // Preserve the original transport error for diagnostics without logging query arguments.
    console.error('Query execution failed', error)
    throw new Error(queryErrorMessage(error), { cause: error })
  }
}
