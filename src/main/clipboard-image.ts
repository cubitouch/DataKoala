const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/
const MAX_PNG_BYTES = 50 * 1024 * 1024

export type ClipboardImageResult = { ok: true } | { ok: false }
export type RichClipboardMode = 'text-and-png' | 'html-embedded' | 'all'

export interface NativeImageLike {
  isEmpty(): boolean
}

export interface ClipboardImageDependencies {
  createFromBuffer(buffer: Buffer): NativeImageLike
  writeImage(image: NativeImageLike): void
  logError(error: unknown): void
}

export interface RichClipboardDependencies {
  createFromBuffer(buffer: Buffer): NativeImageLike
  write(payload: { text?: string; html?: string; image?: NativeImageLike }): void
  logError(error: unknown): void
}

function validatedPng(dataUrl: unknown): { dataUrl: string; imageBytes: Buffer } | null {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_PNG_BYTES * 1.4) return null
  const match = PNG_DATA_URL.exec(dataUrl)
  if (!match) return null
  const bytes = Buffer.from(match[1], 'base64')
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (bytes.length < pngSignature.length || bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(pngSignature)) return null
  return { dataUrl, imageBytes: bytes }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!)
}

/** Validate and write only a real PNG data URL; no text clipboard fallback exists. */
export function writePngDataUrl(
  dataUrl: unknown,
  dependencies: ClipboardImageDependencies
): ClipboardImageResult {
  try {
    const parsed = validatedPng(dataUrl)
    if (!parsed) return { ok: false }
    const image = dependencies.createFromBuffer(parsed.imageBytes)
    if (image.isEmpty()) return { ok: false }
    dependencies.writeImage(image)
    return { ok: true }
  } catch (error) {
    dependencies.logError(error)
    return { ok: false }
  }
}

/**
 * Experimental clipboard payloads for testing one-paste text + image behavior
 * in rich editors such as Slack.
 */
export function writeRichClipboard(
  request: unknown,
  dependencies: RichClipboardDependencies
): ClipboardImageResult {
  try {
    if (!request || typeof request !== 'object') return { ok: false }
    const { dataUrl, text, mode } = request as { dataUrl?: unknown; text?: unknown; mode?: unknown }
    if (typeof text !== 'string' || !text.trim() || text.length > 20_000) return { ok: false }
    if (!['text-and-png', 'html-embedded', 'all'].includes(String(mode))) return { ok: false }

    const parsed = validatedPng(dataUrl)
    if (!parsed) return { ok: false }

    const image = dependencies.createFromBuffer(parsed.imageBytes)
    if (image.isEmpty()) return { ok: false }

    const html = `<p>${escapeHtml(text)}</p><img src="${parsed.dataUrl}" alt="DataKoala chart">`

    if (mode === 'text-and-png') dependencies.write({ text, image })
    else if (mode === 'html-embedded') dependencies.write({ text, html })
    else dependencies.write({ text, html, image })

    return { ok: true }
  } catch (error) {
    dependencies.logError(error)
    return { ok: false }
  }
}
