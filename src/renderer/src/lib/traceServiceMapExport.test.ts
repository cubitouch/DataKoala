// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createServiceMapSvg } from './traceServiceMapExport'

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
    expect(exported).toContain('transform="translate(20,10)"')
    expect(exported).toContain('data-service-map-node="a"')
    expect(exported).toContain('data-service-map-edge="a-b"')
    expect(exported).not.toContain('matrix(3,0,0,3,-900,-400)')
  })
})
