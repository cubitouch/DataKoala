export interface DiagramBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ServiceMapExcalidrawNode {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  strokeColor: string
  backgroundColor: string
  textColor: string
}

export interface ServiceMapExcalidrawEdge {
  id: string
  sourceId: string
  targetId: string
  sourceFixedPoint: [number, number]
  targetFixedPoint: [number, number]
  points: Array<{ x: number; y: number }>
  strokeColor: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
}

const MAX_RASTER_PIXELS = 24_000_000
const MAX_SVG_DISPLAY_DIMENSION = 4096

export function createServiceMapSvg(
  source: SVGSVGElement,
  bounds: DiagramBounds,
  background: string,
  padding = 32,
): string {
  const clone = source.cloneNode(true) as SVGSVGElement
  const viewWidth = Math.max(1, Math.ceil(bounds.width + padding * 2))
  const viewHeight = Math.max(1, Math.ceil(bounds.height + padding * 2))
  const displayScale = Math.min(
    1,
    MAX_SVG_DISPLAY_DIMENSION / Math.max(viewWidth, viewHeight),
  )
  const displayWidth = Math.max(1, Math.round(viewWidth * displayScale))
  const displayHeight = Math.max(1, Math.round(viewHeight * displayScale))

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(displayWidth))
  clone.setAttribute('height', String(displayHeight))
  clone.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`)
  clone.setAttribute('preserveAspectRatio', 'xMinYMin meet')
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
  backdrop.setAttribute('x', '0')
  backdrop.setAttribute('y', '0')
  backdrop.setAttribute('width', String(viewWidth))
  backdrop.setAttribute('height', String(viewHeight))
  backdrop.setAttribute('fill', background)
  clone.insertBefore(backdrop, clone.firstChild)

  return new XMLSerializer().serializeToString(clone)
}

function stableSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.max(1, hash >>> 0)
}

function excalidrawBase(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: stableSeed(id),
    version: 1,
    versionNonce: stableSeed(`${id}:version`),
    isDeleted: false,
    boundElements: null,
    updated: 0,
    link: null,
    locked: false,
    created: null,
  }
}

export function createServiceMapExcalidraw(
  nodes: ServiceMapExcalidrawNode[],
  edges: ServiceMapExcalidrawEdge[],
  background: string,
): string {
  const elements: Array<Record<string, unknown>> = []

  const boundArrowIdsByNode = new Map<string, string[]>()
  for (const edge of edges) {
    const arrowId = `edge:${edge.id}`
    boundArrowIdsByNode.set(edge.sourceId, [
      ...(boundArrowIdsByNode.get(edge.sourceId) ?? []),
      arrowId,
    ])
    boundArrowIdsByNode.set(edge.targetId, [
      ...(boundArrowIdsByNode.get(edge.targetId) ?? []),
      arrowId,
    ])
  }

  for (const node of nodes) {
    const rectangleId = `node:${node.id}`
    const textId = `text:${node.id}`
    const boundElements = [
      { id: textId, type: 'text' },
      ...(boundArrowIdsByNode.get(node.id) ?? []).map((id) => ({
        id,
        type: 'arrow',
      })),
    ]
    elements.push({
      ...excalidrawBase(
        rectangleId,
        'rectangle',
        node.x,
        node.y,
        node.width,
        node.height,
      ),
      strokeColor: node.strokeColor,
      backgroundColor: node.backgroundColor,
      strokeWidth: 1.5,
      roundness: { type: 3 },
      boundElements,
    })

    const lines = Math.max(1, node.label.split('\n').length)
    const fontSize = 14
    const lineHeight = 1.25
    const textHeight = fontSize * lineHeight * lines
    elements.push({
      ...excalidrawBase(
        textId,
        'text',
        node.x + 8,
        node.y + Math.max(0, (node.height - textHeight) / 2),
        Math.max(1, node.width - 16),
        textHeight,
      ),
      strokeColor: node.textColor,
      backgroundColor: 'transparent',
      text: node.label,
      fontSize,
      fontFamily: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectangleId,
      originalText: node.label,
      autoResize: false,
      lineHeight,
    })
  }

  for (const edge of edges) {
    if (edge.points.length < 2) continue
    const first = edge.points[0]
    const relativePoints = edge.points.map((point) => [
      point.x - first.x,
      point.y - first.y,
    ])
    const xs = relativePoints.map(([x]) => x)
    const ys = relativePoints.map(([, y]) => y)
    elements.push({
      ...excalidrawBase(
        `edge:${edge.id}`,
        'arrow',
        first.x,
        first.y,
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ),
      strokeColor: edge.strokeColor,
      strokeWidth: Math.max(1, Math.min(4, edge.strokeWidth)),
      strokeStyle: edge.strokeStyle,
      points: relativePoints,
      lastCommittedPoint: null,
      startBinding: {
        elementId: `node:${edge.sourceId}`,
        fixedPoint: edge.sourceFixedPoint,
        mode: 'orbit',
      },
      endBinding: {
        elementId: `node:${edge.targetId}`,
        fixedPoint: edge.targetFixedPoint,
        mode: 'orbit',
      },
      startArrowhead: null,
      endArrowhead: 'arrow',
      elbowed: true,
      fixedSegments: null,
      startIsSpecial: false,
      endIsSpecial: false,
    })
  }

  return JSON.stringify(
    {
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements,
      appState: {
        gridSize: 20,
        viewBackgroundColor: background,
      },
      files: {},
    },
    null,
    2,
  )
}

export function createServiceMapExcalidrawClipboard(sceneJson: string): string {
  const scene = JSON.parse(sceneJson) as {
    elements?: unknown
    files?: unknown
  }
  if (!Array.isArray(scene.elements)) {
    throw new Error('Invalid Excalidraw service-map scene')
  }
  return JSON.stringify({
    type: 'excalidraw/clipboard',
    elements: scene.elements,
    files:
      scene.files && typeof scene.files === 'object' ? scene.files : undefined,
  })
}

export async function rasterizeServiceMapSvg(
  svg: string,
  preferredScale = 2,
): Promise<string> {
  const parsed = new DOMParser().parseFromString(
    svg,
    'image/svg+xml',
  ).documentElement
  const width = Number(parsed.getAttribute('width')) || 1
  const height = Number(parsed.getAttribute('height')) || 1
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
