const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/
const MAX_PNG_BYTES = 50 * 1024 * 1024

export type ClipboardImageResult = { ok: true } | { ok: false }

export interface NativeImageLike {
  isEmpty(): boolean
}

export interface ClipboardImageDependencies {
  createFromBuffer(buffer: Buffer): NativeImageLike
  writeImage(image: NativeImageLike): void
  logError(error: unknown): void
}

/** Validate and write only a real PNG data URL; no text clipboard fallback exists. */
export function writePngDataUrl(
  dataUrl: unknown,
  dependencies: ClipboardImageDependencies
): ClipboardImageResult {
  try {
    if (typeof dataUrl !== 'string' || dataUrl.length > MAX_PNG_BYTES * 1.4) return { ok: false }
    const match = PNG_DATA_URL.exec(dataUrl)
    if (!match) return { ok: false }
    const bytes = Buffer.from(match[1], 'base64')
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (bytes.length < pngSignature.length || bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(pngSignature)) return { ok: false }
    const image = dependencies.createFromBuffer(bytes)
    if (image.isEmpty()) return { ok: false }
    dependencies.writeImage(image)
    return { ok: true }
  } catch (error) {
    dependencies.logError(error)
    return { ok: false }
  }
}
