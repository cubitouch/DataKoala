export interface DiagramBounds {
  x: number
  y: number
  width: number
  height: number
}
const MAX_RASTER_PIXELS = 24_000_000

export function createServiceMapSvg(
  source: SVGSVGElement,
  bounds: DiagramBounds,
  background: string,
  padding = 32,
): string {
  const clone = source.cloneNode(true) as SVGSVGElement
  const width = Math.ceil(bounds.width + padding * 2)
  const height = Math.ceil(bounds.height + padding * 2)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.removeAttribute('style')
  const viewport = clone.querySelector('.joint-viewport')
  viewport?.setAttribute(
    'transform',
    `translate(${padding - bounds.x},${padding - bounds.y})`,
  )
  const backdrop = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'rect',
  )
  backdrop.setAttribute('width', '100%')
  backdrop.setAttribute('height', '100%')
  backdrop.setAttribute('fill', background)
  clone.insertBefore(backdrop, clone.firstChild)
  return new XMLSerializer().serializeToString(clone)
}

export async function rasterizeServiceMapSvg(
  svg: string,
  preferredScale = 2,
): Promise<string> {
  const parsed = new DOMParser().parseFromString(
    svg,
    'image/svg+xml',
  ).documentElement
  const width = Number(parsed.getAttribute('width')) || 1,
    height = Number(parsed.getAttribute('height')) || 1
  const scale = Math.min(
    preferredScale,
    Math.sqrt(MAX_RASTER_PIXELS / (width * height)),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const image = new Image()
  const url = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  )
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Could not rasterize service map'))
      image.src = url
    })
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
