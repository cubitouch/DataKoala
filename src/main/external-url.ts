export function validateExternalUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('External URL must be a string.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('External URL is malformed.') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https external URLs are allowed.')
  return url.toString()
}
