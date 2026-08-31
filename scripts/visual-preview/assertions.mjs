export async function assertCompactObjectFilter(win, expectedLabel) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const input = [...document.querySelectorAll('input[placeholder="Filter objects…"]')]
      .find((candidate) => candidate.getBoundingClientRect().width > 0)
    const field = input?.closest('[data-field]')
    const label = field?.querySelector('[data-field-label]')
    const bounds = label?.parentElement?.getBoundingClientRect()
    return {
      accessibleName: label?.textContent?.replace(/:$/, ''),
      hiddenLabel: field?.getAttribute('data-label-visibility') === 'sr-only',
      labelWidth: bounds?.width,
      labelHeight: bounds?.height
    }
  })()`)
  if (report.accessibleName !== expectedLabel || !report.hiddenLabel || (report.labelWidth ?? 2) > 1 || (report.labelHeight ?? 2) > 1) {
    throw new Error(`Sidebar object filter is not compact and accessible: ${JSON.stringify({ expectedLabel, ...report })}`)
  }
}

export async function assertVisibleSeriesField(win) {
  const visible = await win.webContents.executeJavaScript(`(() => {
    const field = [...document.querySelectorAll('[data-field][data-field-name="Series"]')]
      .find((candidate) => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0)
    return Boolean(field?.querySelector('[data-field-label]') && field?.querySelector('[data-popover-trigger]'))
  })()`)
  if (!visible) throw new Error('A visible semantic Series field is required in this visualization scenario')
}

export async function assertFieldRowGeometry(win, scopeSelector, names) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const scope = document.querySelector(${JSON.stringify(scopeSelector)})
    const rect = (element) => { const bounds = element?.getBoundingClientRect(); return bounds ? { top: bounds.top, bottom: bounds.bottom, height: bounds.height } : null }
    return ${JSON.stringify(names)}.map((name) => {
      const field = [...(scope?.querySelectorAll('[data-field]') ?? [])].find((candidate) => candidate.getAttribute('data-field-name') === name)
      const label = rect(field?.querySelector('[data-field-label]')?.parentElement)
      const control = rect(field?.querySelector('[data-popover-trigger], input'))
      return { name, label, control, gap: label && control ? control.top - label.bottom : null }
    })
  })()`)
  const metrics = ['label.top', 'label.bottom', 'control.top', 'control.bottom', 'gap']
  for (const metric of metrics) {
    const values = report.map((item) => metric === 'gap' ? item.gap : metric.split('.').reduce((value, key) => value?.[key], item))
    if (values.some((value) => typeof value !== 'number') || Math.max(...values) - Math.min(...values) > 1) {
      throw new Error(`Mixed field geometry differs for ${metric}: ${JSON.stringify(report)}`)
    }
  }
}

/**
 * Every regression preview opts into one of these states. Keeping this list next
 * to the capture assertion makes adding an unaudited screenshot impossible.
 */
export const previewExpectations = Object.freeze({
  'sql-default.png': { selector: '[data-result-chart-canvas]', description: 'SQL default chart', minSeries: 1, minItems: 1 },
  'prometheus-toolbar.png': { kind: 'not-visualization' },
  'prometheus-toolbar-narrow.png': { kind: 'not-visualization' },
  'prometheus-builder.png': { kind: 'not-visualization' },
  'prometheus-builder-narrow.png': { kind: 'not-visualization' },
  'tempo-trace-builder.png': { kind: 'not-visualization' },
  'tempo-trace-search.png': { kind: 'not-visualization' },
  'tempo-trace-scatter.png': { selector: '[data-trace-scatter] [data-visual-type="scatter"]', description: 'Tempo trace scatter in Last hour', minSeries: 1, minItems: 5 },
  'tempo-service-map.png': { selector: '[data-trace-service-map]', description: 'Tempo service map', minNodes: 1, minEdges: 1 },
  'tempo-service-map-dense.png': { selector: '[data-trace-service-map]', description: 'Tempo dense grouped service map (60 fixture services)', minNodes: 5, minEdges: 1 },
  'tempo-service-map-fullscreen.png': { selector: '[data-trace-service-map]', description: 'Tempo fullscreen async service map (60 fixture services)', minNodes: 1, minEdges: 1 },
  'tempo-waterfall.png': { selector: '[data-trace-waterfall]', description: 'Tempo trace waterfall', minItems: 1 },
  'loki-log-list.png': { kind: 'not-visualization' },
  'loki-log-chart.png': { selector: '[data-result-chart-canvas]', description: 'Loki log-volume trend', minSeries: 1, minItems: 1 },
  'sql-resized-panes.png': { selector: '[data-result-chart-canvas]', description: 'SQL chart with resized panes', minSeries: 1, minItems: 1 },
  'sql-long-query-scroll.png': { selector: '[data-result-chart-canvas]', description: 'SQL chart below long query', minSeries: 1, minItems: 1 },
  'sql-wide-sidebar-long-names.png': { selector: '[data-result-chart-canvas]', description: 'SQL chart with wide sidebar', minSeries: 1, minItems: 1 },
  'sql-narrow-short-tooltip.png': { selector: '[data-result-chart-canvas]', description: 'SQL narrow chart', minSeries: 1, minItems: 1 },
  'builder-temporal-series.png': { selector: '[data-result-chart-canvas]', description: 'Builder temporal series chart', minSeries: 1, minItems: 1 },
  'builder-categorical-numeric.png': { selector: '[data-result-chart-canvas]', description: 'Builder categorical chart', minSeries: 1, minItems: 1 },
  'builder-count-without-y.png': { selector: '[data-result-chart-canvas]', description: 'Builder count chart', minSeries: 1, minItems: 1 },
  'builder-narrow.png': { selector: '[data-result-chart-canvas]', description: 'Builder narrow chart', minSeries: 1, minItems: 1 },
  'table.png': { kind: 'not-visualization' }
})

export function validateVisualReport(previewName, expectation, report) {
  if (expectation.kind === 'not-visualization') return
  if (!report) throw new Error(`[${previewName}] Missing ${expectation.description} semantic report (${expectation.selector})`)
  const diagnostics = JSON.stringify({ previewName, visualization: report.type, expectation, actual: report })
  if (!report.finished) throw new Error(`[${previewName}] ${expectation.description} has not finished rendering. ${diagnostics}`)
  const counts = [['series', 'minSeries'], ['items', 'minItems'], ['nodes', 'minNodes'], ['edges', 'minEdges']]
  if (expectation.expectEmpty) {
    if (counts.some(([actual]) => Number(report[actual] ?? 0) !== 0)) throw new Error(`[${previewName}] Expected an intentionally empty visualization. ${diagnostics}`)
    return
  }
  for (const [actual, minimum] of counts) {
    if (expectation[minimum] != null && Number(report[actual] ?? 0) < expectation[minimum]) {
      throw new Error(`[${previewName}] ${expectation.description} expected ${minimum}=${expectation[minimum]}, actual ${actual}=${report[actual] ?? 0}. ${diagnostics}`)
    }
  }
}

export async function assertPreviewReady(win, previewName, override) {
  const expectation = override ?? previewExpectations[previewName]
  if (!expectation) throw new Error(`[${previewName}] has no audited visual-preview expectation`)
  if (expectation.kind === 'not-visualization') return
  let report = null
  for (let attempt = 0; attempt < 100; attempt += 1) {
    report = await win.webContents.executeJavaScript(`(() => {
      const element = document.querySelector(${JSON.stringify(expectation.selector)})
      if (!element) return null
      const number = (name) => Number(element.getAttribute(name) || 0)
      return { type: element.getAttribute('data-visual-type'), finished: element.getAttribute('data-visual-finished') === 'true', series: number('data-visual-series'), items: number('data-visual-items'), nodes: number('data-visual-nodes'), edges: number('data-visual-edges'), range: element.getAttribute('data-visual-range'), fixture: element.getAttribute('data-visual-fixture') }
    })()`)
    try { validateVisualReport(previewName, expectation, report); return report } catch (error) {
      if (attempt === 99) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
