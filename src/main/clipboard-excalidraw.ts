export type ExcalidrawClipboardResult = { ok: true } | { ok: false }

export interface ExcalidrawClipboardDependencies {
  writeText(value: string): Promise<void>
  readText(): Promise<string>
  logError(error: unknown): void
}

/** Only the validated Excalidraw clipboard envelope can be written. */
export async function writeExcalidrawClipboard(
  value: unknown,
  dependencies: ExcalidrawClipboardDependencies,
): Promise<ExcalidrawClipboardResult> {
  if (typeof value !== 'string' || value.length > 20_000_000)
    return { ok: false }
  try {
    const parsed = JSON.parse(value) as {
      type?: unknown
      elements?: unknown
    }
    if (
      parsed.type !== 'excalidraw/clipboard' ||
      !Array.isArray(parsed.elements)
    ) {
      return { ok: false }
    }
    await dependencies.writeText(value)
    return { ok: (await dependencies.readText()) === value }
  } catch (error) {
    dependencies.logError(error)
    return { ok: false }
  }
}
