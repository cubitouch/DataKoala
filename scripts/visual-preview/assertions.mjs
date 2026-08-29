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
