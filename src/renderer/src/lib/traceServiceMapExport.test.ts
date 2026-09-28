// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  createServiceMapExcalidraw,
  createServiceMapSvg,
} from './traceServiceMapExport'

describe('service map SVG export', () => {
  it('normalizes the whole content bounds independently of the viewport transform', () => {
    const source = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    source.setAttribute('width', '400')
    source.setAttribute('height', '200')
    source.innerHTML =
      '<g class="joint-viewport" transform="matrix(3,0,0,3,-900,-400)"><g class="joint-link" data-service-map-edge="a-b"><path d="M10 10L200 10" /></g><g class="joint-element" data-service-map-node="a"><rect width="100" height="40" /></g></g>'
    const exported = createServiceMapSvg(
      source,
      { x: 10, y: 20, width: 500, height: 240 },
      '#17201f',
      30,
    )
    expect(exported).toContain('width="560"')
    expect(exported).toContain('height="300"')
    expect(exported).toContain('viewBox="0 0 560 300"')
    expect(exported).toContain('preserveAspectRatio="xMinYMin meet"')
    expect(exported).toContain('transform="translate(20,10)"')
    expect(exported).toContain('data-service-map-node="a"')
    expect(exported).toContain('data-service-map-edge="a-b"')
    expect(exported).not.toContain('matrix(3,0,0,3,-900,-400)')
  })

  it('caps the imported display size without sacrificing vector viewBox detail', () => {
    const source = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    source.innerHTML = '<g class="joint-viewport"><rect width="10000" height="4000" /></g>'
    const exported = createServiceMapSvg(
      source,
      { x: 0, y: 0, width: 10000, height: 4000 },
      '#17201f',
      32,
    )
    const parsed = new DOMParser().parseFromString(exported, 'image/svg+xml').documentElement
    expect(Number(parsed.getAttribute('width'))).toBeLessThanOrEqual(4096)
    expect(Number(parsed.getAttribute('height'))).toBeLessThanOrEqual(4096)
    expect(parsed.getAttribute('viewBox')).toBe('0 0 10064 4064')
  })
})

describe('service map Excalidraw export', () => {
  it('exports editable rectangles, labels and arrows as a native scene', () => {
    const exported = createServiceMapExcalidraw(
      [{
        id: 'api',
        label: 'API',
        x: 10,
        y: 20,
        width: 120,
        height: 42,
        strokeColor: '#516666',
        backgroundColor: '#202b2a',
        textColor: '#fff9f1',
      }, {
        id: 'worker',
        label: 'Worker',
        x: 200,
        y: 20,
        width: 120,
        height: 42,
        strokeColor: '#516666',
        backgroundColor: '#202b2a',
        textColor: '#fff9f1',
      }],
      [{
        id: 'api-worker',
        sourceId: 'api',
        targetId: 'worker',
        sourceFixedPoint: [1, 0.5],
        targetFixedPoint: [0, 0.5],
        points: [{ x: 130, y: 41 }, { x: 200, y: 41 }],
        strokeColor: '#617f7f',
        strokeWidth: 2,
        strokeStyle: 'solid',
      }],
      '#17201f',
    )
    const scene = JSON.parse(exported)
    expect(scene.type).toBe('excalidraw')
    expect(scene.version).toBe(2)
    expect(scene.elements.map((element: { type: string }) => element.type)).toEqual([
      'rectangle',
      'text',
      'rectangle',
      'text',
      'arrow',
    ])
    const source = scene.elements.find((element: { id: string }) => element.id === 'node:api')
    const sourceText = scene.elements.find((element: { id: string }) => element.id === 'text:api')
    const target = scene.elements.find((element: { id: string }) => element.id === 'node:worker')
    const arrow = scene.elements.find((element: { id: string }) => element.id === 'edge:api-worker')
    expect(source.boundElements).toContainEqual({ id: 'text:api', type: 'text' })
    expect(source.boundElements).toContainEqual({ id: 'edge:api-worker', type: 'arrow' })
    expect(target.boundElements).toContainEqual({ id: 'edge:api-worker', type: 'arrow' })
    expect(sourceText.containerId).toBe('node:api')
    expect(arrow.startBinding).toEqual({
      elementId: 'node:api',
      fixedPoint: [1, 0.5],
      mode: 'orbit',
    })
    expect(arrow.endBinding).toEqual({
      elementId: 'node:worker',
      fixedPoint: [0, 0.5],
      mode: 'orbit',
    })
    expect(scene.appState.viewBackgroundColor).toBe('#17201f')
  })
})
