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
