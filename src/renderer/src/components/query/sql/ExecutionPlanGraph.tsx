import { useEffect, useMemo, useRef } from 'react'
import { dia, shapes } from '@joint/core'
import '@joint/react/styles.css'
import type { ExplainNode } from '@shared/types'
import {
  compareCardinality,
  explainNodeTiming,
  EXPLAIN_DIAGNOSTIC_LIMITS,
} from './ExecutionPlanPresentation'
import {
  executionPlanNodeContent,
  layoutExecutionPlan,
  mapExecutionPlan,
} from './ExecutionPlanGraphModel'
import styles from './ExecutionPlanGraph.module.css'

export interface ExecutionPlanGraphProps {
  tree: ExplainNode
  analyze: boolean
  selectedNodeId: string
  highlightedNodeIds?: readonly string[]
  focusNodeId?: string | null
  focusRequestId?: number
  onSelectNode(nodeId: string): void
}

const NODE_WIDTH = 280
const NODE_HEIGHT = 176
const RANK_GAP = 76
const SIBLING_GAP = 44
const GRAPH_PADDING = 36

const ExecutionPlanNode = dia.Element.define(
  'datakoala.ExecutionPlanNode',
  {},
  {
    markup: [
      { tagName: 'rect', selector: 'body' },
      { tagName: 'text', selector: 'category' },
      { tagName: 'text', selector: 'title' },
      { tagName: 'text', selector: 'target' },
      { tagName: 'text', selector: 'estimatedRows' },
      { tagName: 'text', selector: 'actualRows' },
      { tagName: 'text', selector: 'ratio' },
      { tagName: 'text', selector: 'work' },
    ],
  },
)

function cssColor(name: string, fallback: string): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  )
}

function normalNodeStroke(): string {
  return `color-mix(in srgb, ${cssColor('--border', '#3a3d45')} 55%, ${cssColor('--text-mute', '#858b97')})`
}

function planNodeAttributes(
  node: ExplainNode,
  analyze: boolean,
): Record<string, Record<string, string | number>> {
  const content = executionPlanNodeContent(node, analyze)
  const textStyle = {
    textAnchor: 'start',
    textVerticalAnchor: 'middle',
    fontFamily: 'Inter, system-ui, sans-serif',
  }
  const metricStyle = {
    ...textStyle,
    x: 14,
    fill: cssColor('--text-dim', '#b5bbc5'),
    fontSize: 10,
  }
  return {
    body: {
      rx: 10,
      ry: 10,
      fill: cssColor('--bg-2', '#202329'),
      stroke: normalNodeStroke(),
      strokeWidth: 1.5,
    },
    category: {
      ...textStyle,
      text: content.category.toUpperCase(),
      x: 14,
      y: 19,
      fill: cssColor('--text-mute', '#858b97'),
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.7,
    },
    title: {
      ...textStyle,
      text: content.nodeType,
      x: 14,
      y: 42,
      fill: cssColor('--text', '#f2f2f4'),
      fontSize: 13,
      fontWeight: 700,
    },
    target: {
      ...textStyle,
      text: content.target ?? '',
      display: content.target ? 'block' : 'none',
      x: 14,
      y: 63,
      fill: cssColor('--text-dim', '#b5bbc5'),
      fontSize: 10,
    },
    estimatedRows: {
      ...metricStyle,
      text: content.estimatedRows ?? '',
      display: content.estimatedRows ? 'block' : 'none',
      y: 91,
    },
    actualRows: {
      ...metricStyle,
      text: content.actualRows ?? '',
      display: content.actualRows ? 'block' : 'none',
      y: 111,
    },
    ratio: {
      ...metricStyle,
      text: content.ratio ?? '',
      display: content.ratio ? 'block' : 'none',
      y: 131,
      fill: content.ratio
        ? cssColor('--amber', '#efb44f')
        : cssColor('--text-dim', '#b5bbc5'),
    },
    work: {
      ...metricStyle,
      text: content.work ?? '',
      display: content.work ? 'block' : 'none',
      y: 151,
      fill: analyze
        ? cssColor('--blue', '#79a9ff')
        : cssColor('--text-mute', '#858b97'),
    },
  }
}

export function ExecutionPlanGraph({
  tree,
  analyze,
  selectedNodeId,
  highlightedNodeIds = [],
  focusNodeId,
  focusRequestId = 0,
  onSelectNode,
}: ExecutionPlanGraphProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<dia.Paper | null>(null)
  const graphRef = useRef<dia.Graph | null>(null)
  const mapped = useMemo(() => mapExecutionPlan(tree), [tree])
  const graphKey = JSON.stringify({
    nodes: mapped.nodes.map(({ id, node }) => [
      id,
      executionPlanNodeContent(node, analyze),
    ]),
    edges: mapped.edges.map(({ id, order }) => [id, order]),
  })
  const highlighted = useMemo(
    () => new Set(highlightedNodeIds),
    [highlightedNodeIds],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const paperHost = document.createElement('div')
    paperHost.className = styles.paper
    host.appendChild(paperHost)

    const graph = new dia.Graph({}, { cellNamespace: shapes })
    const paper = new dia.Paper({
      el: paperHost,
      model: graph,
      cellViewNamespace: shapes,
      async: true,
      width: '100%',
      height: '100%',
      background: { color: cssColor('--bg', '#17201f') },
      interactive: {
        elementMove: false,
        addLinkFromMagnet: false,
        labelMove: false,
        linkMove: false,
      },
      sorting: dia.Paper.sorting.APPROX,
      frozen: true,
      gridSize: 10,
    })
    graphRef.current = graph
    paperRef.current = paper

    const positions = layoutExecutionPlan(
      tree,
      NODE_WIDTH,
      NODE_HEIGHT,
      RANK_GAP,
      SIBLING_GAP,
    )
    const nodes = mapped.nodes.map(({ id, node }) => {
      const cardinality = analyze ? compareCardinality(node) : null
      const materialMismatch =
        cardinality !== null && cardinality.relation !== 'close'
      const timing = analyze ? explainNodeTiming(node) : null
      const highWork =
        timing?.approxTotalMs !== undefined &&
        timing.approxTotalMs >= EXPLAIN_DIAGNOSTIC_LIMITS.highMeasuredWorkMs
      const attrs = planNodeAttributes(node, analyze)
      return new ExecutionPlanNode({
        id,
        position: positions.get(id),
        size: { width: NODE_WIDTH, height: NODE_HEIGHT },
        attrs: {
          root: {
            cursor: 'pointer',
            tabindex: 0,
            role: 'button',
            'data-testid': 'plan-node',
            'data-node-id': id,
            'aria-label': `${node.nodeType}${node.relation ? ` on ${node.relation}` : ''}`,
          },
          ...attrs,
          body: {
            ...attrs.body,
            stroke:
              highWork || materialMismatch
                ? cssColor('--amber', '#efb44f')
                : cssColor('--border', '#3a3d45'),
            strokeWidth: highWork || materialMismatch ? 2.5 : 1.5,
          },
        },
      })
    })
    const edges = mapped.edges.map(
      ({ id, source, target }) =>
        new shapes.standard.Link({
          id,
          source: { id: source, anchor: { name: 'bottom' } },
          target: { id: target, anchor: { name: 'top' } },
          router: {
            name: 'manhattan',
            args: {
              padding: 18,
              step: 12,
              startDirections: ['bottom'],
              endDirections: ['top'],
            },
          },
          connector: { name: 'rounded', args: { radius: 7 } },
          attrs: {
            line: {
              fill: 'none',
              stroke: cssColor('--text-mute', '#777d89'),
              strokeWidth: 1.5,
              targetMarker: {
                type: 'path',
                d: 'M 8 -4 0 0 8 4 z',
                fill: cssColor('--text-mute', '#777d89'),
                stroke: 'none',
              },
            },
          },
        }),
    )
    graph.resetCells([...nodes, ...edges])

    const selectNode = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest('[data-node-id]')
      const id = target?.getAttribute('data-node-id')
      if (id) onSelectNode(id)
    }
    host.addEventListener('click', selectNode)
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const target = event.target as Element | null
      const id = target?.closest('[data-node-id]')?.getAttribute('data-node-id')
      if (!id) return
      event.preventDefault()
      onSelectNode(id)
    }
    host.addEventListener('keydown', keydown)

    let panOrigin: { x: number; y: number; tx: number; ty: number } | null =
      null
    const panMove = (event: PointerEvent) => {
      if (panOrigin)
        paper.translate(
          panOrigin.tx + event.clientX - panOrigin.x,
          panOrigin.ty + event.clientY - panOrigin.y,
        )
    }
    const panEnd = () => {
      panOrigin = null
      host.classList.remove(styles.panning)
    }
    paper.on('blank:pointerdown', (event: dia.Event) => {
      const pointer = event as unknown as PointerEvent
      const translation = paper.translate()
      panOrigin = {
        x: pointer.clientX,
        y: pointer.clientY,
        tx: translation.tx,
        ty: translation.ty,
      }
      host.classList.add(styles.panning)
    })
    window.addEventListener('pointermove', panMove)
    window.addEventListener('pointerup', panEnd)

    const fit = () =>
      paper.scaleContentToFit({
        padding: GRAPH_PADDING,
        minScale: 0.22,
        maxScale: 1.15,
      })
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const scale = paper.scale().sx
      const next = Math.max(
        0.22,
        Math.min(3, scale * (event.deltaY < 0 ? 1.1 : 0.91)),
      )
      paper.scaleUniformAtPoint(
        next,
        paper.clientToLocalPoint({ x: event.clientX, y: event.clientY }),
      )
    }
    host.addEventListener('wheel', wheel, { passive: false })
    let resizeFrame = 0
    let previousWidth = 0
    let previousHeight = 0
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.contentRect
      if (
        !size ||
        size.width <= 0 ||
        size.height <= 0 ||
        (size.width === previousWidth && size.height === previousHeight)
      )
        return
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0
        const bounds = host.getBoundingClientRect()
        if (bounds.width <= 0 || bounds.height <= 0) return
        if (bounds.width === previousWidth && bounds.height === previousHeight)
          return
        previousWidth = bounds.width
        previousHeight = bounds.height
        paper.setDimensions(bounds.width, bounds.height)
      })
    })
    observer.observe(host)

    let initialFitDone = false
    paper.unfreeze({
      batchSize: 100,
      afterRender: () => {
        if (initialFitDone) return
        initialFitDone = true
        fit()
      },
    })
    return () => {
      observer.disconnect()
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      host.removeEventListener('click', selectNode)
      host.removeEventListener('keydown', keydown)
      host.removeEventListener('wheel', wheel)
      window.removeEventListener('pointermove', panMove)
      window.removeEventListener('pointerup', panEnd)
      paper.remove()
      if (paperRef.current === paper) paperRef.current = null
      if (graphRef.current === graph) graphRef.current = null
    }
    // Cells are rebuilt only when plan topology changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, analyze])

  useEffect(() => {
    const graph = graphRef.current
    const paper = paperRef.current
    if (!graph || !paper) return
    const updateSelection = () => {
      let missingView = false
      mapped.nodes.forEach(({ id, node }) => {
        const model = graph.getCell(id) as dia.Element | undefined
        if (!model) return
        const view = paper.findViewByModel(model)
        const body = view?.el.querySelector('rect')
        if (!view || !body) {
          missingView = true
          return
        }
        const isSelected = selectedNodeId === id
        const isHighlighted = highlighted.has(id)
        const cardinality = analyze ? compareCardinality(node) : null
        const materialMismatch =
          cardinality !== null && cardinality.relation !== 'close'
        const timing = analyze ? explainNodeTiming(node) : null
        const highWork =
          timing?.approxTotalMs !== undefined &&
          timing.approxTotalMs >= EXPLAIN_DIAGNOSTIC_LIMITS.highMeasuredWorkMs
        const category = node.nodeType.toLowerCase()
        const accent =
          category.includes('join') || category === 'nested loop'
            ? cssColor('--purple', '#a78bfa')
            : category.includes('scan')
              ? cssColor('--accent', '#f0c34e')
              : cssColor('--blue', '#79a9ff')
        const emphasis =
          highWork || materialMismatch
            ? cssColor('--amber', '#efb44f')
            : normalNodeStroke()
        body.setAttribute(
          'stroke',
          isSelected
            ? cssColor('--text', '#f2f2f4')
            : isHighlighted
              ? accent
              : emphasis,
        )
        body.setAttribute(
          'stroke-width',
          String(
            isSelected
              ? 3
              : isHighlighted || highWork || materialMismatch
                ? 2.5
                : 1.5,
          ),
        )
        body.setAttribute(
          'fill',
          isHighlighted
            ? cssColor('--bg-3', '#2b2e36')
            : cssColor('--bg-2', '#202329'),
        )
        view.el.setAttribute('data-ai-highlighted', String(isHighlighted))
        view.el.setAttribute('data-selected', String(isSelected))
        view.el.setAttribute('aria-pressed', String(isSelected))
      })
      return missingView
    }
    if (updateSelection()) paper.on('render:done', updateSelection)
    return () => {
      paper.off('render:done', updateSelection)
    }
  }, [analyze, highlighted, mapped.nodes, selectedNodeId])

  useEffect(() => {
    if (!focusNodeId) return
    const host = hostRef.current
    const graph = graphRef.current
    const paper = paperRef.current
    const model = graph?.getCell(focusNodeId) as dia.Element | undefined
    if (!host || !paper || !model) return
    const frame = window.requestAnimationFrame(() => {
      if (paperRef.current !== paper || graphRef.current !== graph) return
      const position = model.position()
      const size = model.size()
      const matrix = paper.matrix()
      matrix.e = host.clientWidth / 2 - (position.x + size.width / 2) * matrix.a
      matrix.f =
        host.clientHeight / 2 - (position.y + size.height / 2) * matrix.d
      paper.layers.setAttribute(
        'transform',
        `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},${matrix.e},${matrix.f})`,
      )
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusNodeId, focusRequestId, graphKey])

  const zoom = (factor: number) => {
    const paper = paperRef.current
    const host = hostRef.current
    if (!paper || !host) return
    const scale = Math.max(0.22, Math.min(3, paper.scale().sx * factor))
    paper.scaleUniformAtPoint(
      scale,
      paper.clientToLocalPoint({
        x: host.getBoundingClientRect().left + host.clientWidth / 2,
        y: host.getBoundingClientRect().top + host.clientHeight / 2,
      }),
    )
  }

  return (
    <section
      className={styles.root}
      aria-label="Execution plan diagram"
      data-node-count={mapped.nodes.length}
      data-edge-count={mapped.edges.length}
      data-selected-node-id={selectedNodeId}
      data-highlighted-node-ids={[...highlighted].join(',')}
      data-focus-node-id={focusNodeId ?? ''}
    >
      <div className={styles.toolbar} aria-label="Plan diagram navigation">
        <button
          type="button"
          className="btn ghost"
          onClick={() => zoom(1.2)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => zoom(0.83)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            paperRef.current?.scaleContentToFit({
              padding: GRAPH_PADDING,
              minScale: 0.22,
              maxScale: 1.15,
            })
          }
        >
          Fit plan
        </button>
      </div>
      <div
        ref={hostRef}
        className={styles.canvas}
        data-testid="execution-plan-joint-surface"
      />
    </section>
  )
}
