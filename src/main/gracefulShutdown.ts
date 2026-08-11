export interface BeforeQuitEventLike {
  preventDefault(): void
}

/**
 * Electron fires `before-quit` again when `app.quit()` is called after cleanup.
 * This coordinator prevents the first quit, awaits database cleanup exactly once,
 * then allows the second quit to proceed normally.
 */
export function createGracefulShutdown(
  disconnectAll: () => Promise<void>,
  quit: () => void,
  reportError: (error: unknown) => void = (error) => console.error('[app] database shutdown cleanup failed', error)
): (event: BeforeQuitEventLike) => void {
  let cleanup: Promise<void> | null = null
  let readyToQuit = false

  return (event) => {
    if (readyToQuit) return

    event.preventDefault()
    if (cleanup) return

    cleanup = Promise.resolve()
      .then(disconnectAll)
      .catch(reportError)
      .finally(() => {
        readyToQuit = true
        quit()
      })
  }
}
