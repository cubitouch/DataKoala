import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type Ref,
} from 'react'
import { dia, shapes } from '@joint/core'
import { DirectedGraph } from '@joint/layout-directed-graph'
import '@joint/react/styles.css'
import type {
  TraceServiceMapViewEdge,
  TraceServiceMapViewNode,
} from '@lib/traceServiceMapGrouping'
import {
  createServiceMapExcalidraw,
  createServiceMapSvg,
  rasterizeServiceMapSvg,
  type DiagramBounds,
} from '@lib/traceServiceMapExport'
import styles from './TraceServiceMap.module.css'

export interface ServiceMapPalette {
  accent: string
  accent2: string
  bg: string
  bg2: string
  bg4: string
  border: string
  text: string
  mute: string
  red: string
}
export interface TraceServiceMapCanvasHandle {
  fit(): void
  svg(): string
  png(): Promise<string>
  excalidraw(): string
}
interface Props {
  nodes: TraceServiceMapViewNode[]
  edges: TraceServiceMapViewEdge[]
  colors: ServiceMapPalette
  selectedNodeId?: string
  selectedEdgeKey?: string
  matchingNodeIds: Set<string>
  searching: boolean
  topEdgeKeys: Set<string>
  slowEdgeKeys: Set<string>
  onNodeClick(id: string): void
  onEdgeClick(id: string): void
  nodeTooltip(node: TraceServiceMapViewNode): string
  edgeTooltip(edge: TraceServiceMapViewEdge): string
  onReady(): void
  canvasRef?: Ref<TraceServiceMapCanvasHandle>
}

const PADDING = 36
function width(node: TraceServiceMapViewNode): number {
  const longest = Math.max(
    8,
    ...node.label.split('\n').map((line) => line.length),
  )
  return Math.max(
    node.viewKind === 'group' ? 140 : 104,
    Math.min(260, 48 + longest * 7),
  )
}

export function TraceServiceMapCanvas({
  nodes,
  edges,
  colors,
  selectedNodeId,
  selectedEdgeKey,
  matchingNodeIds,
  searching,
  topEdgeKeys,
  slowEdgeKeys,
  onNodeClick,
  onEdgeClick,
  nodeTooltip,
  edgeTooltip,
  onReady,
  canvasRef,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const paperRef = useRef<dia.Paper | null>(null)
  const graphRef = useRef<dia.Graph | null>(null)
  const boundsRef = useRef<DiagramBounds>({ x: 0, y: 0, width: 1, height: 1 })
  const [tooltip, setTooltip] = useState<{
    html: string
    x: number
    y: number
  } | null>(null)
  const graphKey = `${nodes.map((node) => node.id).join('|')}::${edges.map((edge) => edge.key).join('|')}`

  const fit = () =>
    paperRef.current?.scaleContentToFit({
      padding: PADDING,
      minScale: 0.25,
      maxScale: 1.25,
    })
  const renderedBounds = (): DiagramBounds => {
    const paper = paperRef.current
    if (!paper) return boundsRef.current
    const area = paper.getContentArea()
    const bounds = {
      x: area.x,
      y: area.y,
      width: Math.max(1, area.width),
      height: Math.max(1, area.height),
    }
    boundsRef.current = bounds
    return bounds
  }
  useImperativeHandle(
    canvasRef,
    () => ({
      fit,
      svg: () => {
        const svg = host.current?.querySelector('svg')
        if (!svg) throw new Error('Service map is not available')
        return createServiceMapSvg(svg, renderedBounds(), colors.bg, PADDING)
      },
      png: async () => {
        const svg = host.current?.querySelector('svg')
        if (!svg) throw new Error('Service map is not available')
        return rasterizeServiceMapSvg(
          createServiceMapSvg(svg, renderedBounds(), colors.bg, PADDING),
        )
      },
      excalidraw: () => {
        const graph = graphRef.current
        if (!graph) throw new Error('Service map is not available')
        const sceneNodes = nodes.map((node) => {
          const model = graph.getCell(node.id) as dia.Element | undefined
          if (!model) throw new Error(`Service map node ${node.id} is not available`)
          const position = model.position()
          const size = model.size()
          return {
            id: node.id,
            label: node.label,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            strokeColor: String(model.attr('body/stroke') ?? colors.border),
            backgroundColor: String(model.attr('body/fill') ?? colors.bg2),
            textColor: String(model.attr('label/fill') ?? colors.text),
          }
        })
        const nodeById = new Map(sceneNodes.map((node) => [node.id, node]))
        const sceneEdges = edges.flatMap((edge) => {
          const source = nodeById.get(edge.source)
          const target = nodeById.get(edge.target)
          const model = graph.getCell(edge.key) as dia.Link | undefined
          if (!source || !target || !model) return []
          const leftToRight = source.x <= target.x
          const start = {
            x: leftToRight ? source.x + source.width : source.x,
            y: source.y + source.height / 2,
          }
          const end = {
            x: leftToRight ? target.x : target.x + target.width,
            y: target.y + target.height / 2,
          }
          const midX = (start.x + end.x) / 2
          return [{
            id: edge.key,
            points: [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end],
            strokeColor: String(model.attr('line/stroke') ?? colors.mute),
            strokeWidth: Number(model.attr('line/strokeWidth') ?? 1.5),
            strokeStyle: edge.kind === 'async' ? 'dashed' as const : edge.kind === 'mixed' ? 'dotted' as const : 'solid' as const,
          }]
        })
        return createServiceMapExcalidraw(sceneNodes, sceneEdges, colors.bg)
      },
    })
  )

  useEffect(() => {
    const hostElement = host.current
    if (!hostElement) return
    // JointJS View#remove() removes the view's `el`. Keep that lifecycle wholly
    // inside this React-owned host so StrictMode cleanup cannot detach the host.
    const paperElement = document.createElement('div')
    paperElement.className = styles.jointPaper
    hostElement.appendChild(paperElement)
    const graph = new dia.Graph({}, { cellNamespace: shapes })
    const paper = new dia.Paper({
      el: paperElement,
      model: graph,
      cellViewNamespace: shapes,
      async: true,
      width: '100%',
      height: '100%',
      background: { color: colors.bg },
      interactive: false,
      sorting: dia.Paper.sorting.APPROX,
      frozen: true,
    })
    graphRef.current = graph
    paperRef.current = paper
    const nodeModels = nodes.map(
      (node) =>
        new shapes.standard.Rectangle({
          id: node.id,
          size: {
            width: width(node),
            height: node.viewKind === 'group' ? 48 : 42,
          },
          attrs: {
            root: { cursor: 'pointer', 'data-service-map-node': node.id },
            body: {
              rx: 8,
              ry: 8,
              fill: colors.bg2,
              stroke: colors.border,
              strokeWidth: 1.5,
            },
            label: {
              text: node.label,
              fill: colors.text,
              fontSize: 11,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: node.viewKind === 'group' ? 650 : 500,
            },
          },
        }),
    )
    const linkModels = edges.map(
      (edge) =>
        new shapes.standard.Link({
          id: edge.key,
          source: { id: edge.source },
          target: { id: edge.target },
          router: { name: 'manhattan', args: { padding: 18, step: 12 } },
          connector: { name: 'rounded', args: { radius: 7 } },
          attrs: {
            root: {
              cursor: edge.memberEdgeKeys.length === 1 ? 'pointer' : 'default',
              'data-service-map-edge': edge.key,
            },
            line: {
              fill: 'none',
              stroke: colors.mute,
              strokeWidth:
                1 + Math.min(4.5, Math.sqrt(Math.max(0, edge.traceRate)) * 4),
              strokeDasharray:
                edge.kind === 'async'
                  ? '8 5'
                  : edge.kind === 'mixed'
                    ? '2 5'
                    : 'none',
              targetMarker: {
                type: 'path',
                d: 'M 9 -4 0 0 9 4 z',
                fill: colors.mute,
                stroke: 'none',
              },
            },
          },
        }),
    )
    graph.resetCells([...nodeModels, ...linkModels])
    DirectedGraph.layout(graph, {
      rankDir: 'LR',
      ranker: 'network-simplex',
      nodeSep: 52,
      edgeSep: 20,
      rankSep: 110,
      marginX: PADDING,
      marginY: PADDING,
      setVertices: false,
    })
    const box = graph.getBBox()!
    boundsRef.current = {
      x: box.x,
      y: box.y,
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    }

    paper.on('element:pointerclick', (view: dia.ElementView) =>
      onNodeClick(String(view.model.id)),
    )
    paper.on('link:pointerclick', (view: dia.LinkView) =>
      onEdgeClick(String(view.model.id)),
    )
    const show = (html: string, event: dia.Event) => {
      const pointer = event as unknown as MouseEvent
      const rect = hostElement.getBoundingClientRect()
      setTooltip({
        html,
        x: pointer.clientX - rect.left + 12,
        y: pointer.clientY - rect.top + 12,
      })
    }
    paper.on(
      'element:mouseenter',
      (view: dia.ElementView, event: dia.Event) => {
        const node = nodes.find((item) => item.id === String(view.model.id))
        if (node) show(nodeTooltip(node), event)
      },
    )
    paper.on('link:mouseenter', (view: dia.LinkView, event: dia.Event) => {
      const edge = edges.find((item) => item.key === String(view.model.id))
      if (edge) show(edgeTooltip(edge), event)
    })
    paper.on('cell:mouseleave', () => setTooltip(null))
    let origin: { x: number; y: number; tx: number; ty: number } | null = null
    paper.on('blank:pointerdown', (event: dia.Event) => {
      const pointer = event as unknown as MouseEvent
      const translation = paper.translate()
      origin = {
        x: pointer.clientX,
        y: pointer.clientY,
        tx: translation.tx,
        ty: translation.ty,
      }
      hostElement.classList.add(styles.panning)
    })
    const move = (event: PointerEvent) => {
      if (origin)
        paper.translate(
          origin.tx + event.clientX - origin.x,
          origin.ty + event.clientY - origin.y,
        )
    }
    const up = () => {
      origin = null
      hostElement.classList.remove(styles.panning)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = paper.scale().sx
      const next = Math.max(
        0.25,
        Math.min(4, current * (event.deltaY < 0 ? 1.12 : 0.89)),
      )
      const local = paper.clientToLocalPoint({
        x: event.clientX,
        y: event.clientY,
      })
      paper.scaleUniformAtPoint(next, local)
    }
    hostElement.addEventListener('wheel', wheel, { passive: false })
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (
        !entry ||
        entry.contentRect.width <= 0 ||
        entry.contentRect.height <= 0
      )
        return
      // Updating dimensions leaves scale and translation untouched, preserving
      // the viewport selected by the user across resizes and fullscreen changes.
      paper.setDimensions(entry.contentRect.width, entry.contentRect.height)
    })
    resizeObserver.observe(hostElement)
    let disposed = false
    paper.unfreeze({
      batchSize: 100,
      afterRender: () => {
        if (disposed) return
        renderedBounds()
        fit()
        onReady()
      },
    })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      hostElement.removeEventListener('wheel', wheel)
      resizeObserver.disconnect()
      disposed = true
      paper.remove()
      if (graphRef.current === graph) graphRef.current = null
      if (paperRef.current === paper) paperRef.current = null
    }
    // Rebuild only when the projected graph changes; selection/search styles update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    const focusedNodes = new Set<string>()
    const focusedEdges = new Set<string>()
    if (selectedEdgeKey) {
      const edge = edges.find((item) =>
        item.memberEdgeKeys.includes(selectedEdgeKey),
      )
      if (edge) {
        focusedEdges.add(edge.key)
        focusedNodes.add(edge.source)
        focusedNodes.add(edge.target)
      }
    } else if (selectedNodeId) {
      focusedNodes.add(selectedNodeId)
      edges.forEach((edge) => {
        if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
          focusedEdges.add(edge.key)
          focusedNodes.add(edge.source)
          focusedNodes.add(edge.target)
        }
      })
    }
    const focused = focusedNodes.size > 0
    nodes.forEach((node) => {
      const model = graph.getCell(node.id) as dia.Element | undefined
      if (!model) return
      const root =
        node.rootTraceCount > 0 &&
        node.rootTraceCount ===
          Math.max(...nodes.map((item) => item.rootTraceCount))
      const match = matchingNodeIds.has(node.id)
      const dim =
        (focused && !focusedNodes.has(node.id)) || (searching && !match)
      model.attr({
        body: {
          fill:
            node.viewKind === 'group' || node.errorRate > 0
              ? colors.bg4
              : colors.bg2,
          stroke:
            searching && match
              ? colors.accent
              : node.errorRate > 0
                ? colors.red
                : root || node.viewKind === 'group'
                  ? colors.accent2
                  : colors.border,
          strokeWidth:
            searching && match
              ? 3
              : node.errorRate > 0 || node.viewKind === 'group'
                ? 2
                : 1.5,
          opacity: dim ? 0.16 : 1,
        },
        label: {
          fill:
            node.viewKind === 'group' || root ? colors.accent2 : colors.text,
          opacity: dim ? 0.2 : 1,
        },
      })
    })
    edges.forEach((edge) => {
      const model = graph.getCell(edge.key) as dia.Link | undefined
      if (!model) return
      const selected = focusedEdges.has(edge.key),
        related =
          matchingNodeIds.has(edge.source) || matchingNodeIds.has(edge.target)
      const dim = (focused && !selected) || (searching && !related)
      const accent = edge.memberEdgeKeys.some(
        (key) => topEdgeKeys.has(key) || slowEdgeKeys.has(key),
      )
      const stroke =
        edge.errorRate >= 0.05
          ? colors.red
          : accent
            ? colors.accent
            : colors.mute
      model.attr({
        line: {
          stroke,
          opacity: dim ? 0.07 : selected ? 1 : accent ? 0.88 : 0.42,
          strokeWidth: selected
            ? 4.5
            : 1 + Math.min(4.5, Math.sqrt(Math.max(0, edge.traceRate)) * 4),
          targetMarker: { fill: stroke },
        },
      })
    })
  }, [
    colors,
    edges,
    matchingNodeIds,
    nodes,
    searching,
    selectedEdgeKey,
    selectedNodeId,
    slowEdgeKeys,
    topEdgeKeys,
  ])

  const prevent = (event: ReactMouseEvent) => event.preventDefault()
  return (
    <div
      ref={host}
      className={styles.jointCanvas}
      onContextMenu={prevent}
      data-joint-service-map=""
    >
      {tooltip && (
        <div
          className={styles.graphTooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}
    </div>
  )
}
