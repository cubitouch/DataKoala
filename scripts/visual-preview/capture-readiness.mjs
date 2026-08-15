import { app } from 'electron'

const documentationCapture = process.env.DATAKOALA_PREVIEW_KIND === 'documentation'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function installDocumentationStatusCompatibility(contents) {
  await contents.executeJavaScript(`(() => {
    if (window.__datakoalaDocumentationStatusCompatibility) return
    window.__datakoalaDocumentationStatusCompatibility = true

    const sync = () => {
      const status = document.querySelector('.titlebar [role="status"]')
      if (!status || status.classList.contains('conn-pill')) return
      status.classList.add('conn-pill')
      status.classList.toggle('on', status.getAttribute('data-state') === 'connected')
      status.classList.toggle('err', status.getAttribute('data-state') === 'error')
    }

    sync()
    new MutationObserver(sync).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state']
    })
  })()`)
}

async function waitForTreemapFinished(contents) {
  const treemapActive = await contents.executeJavaScript(`document.querySelector('.result-view-bar button.active')?.textContent?.trim() === 'Treemap'`)
  if (!treemapActive) return

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const report = await contents.executeJavaScript(`(() => {
      const canvas = document.querySelector('.result-chart-canvas canvas')
      const bounds = canvas?.getBoundingClientRect()
      const buttons = [...document.querySelectorAll('.result-chart-actions button')]
      const copy = buttons.find((button) => button.textContent?.trim() === 'Copy chart')
      const exportPng = buttons.find((button) => button.textContent?.trim() === 'Export PNG')
      return {
        canvas: Boolean(canvas && bounds && bounds.width > 100 && bounds.height > 100),
        copyReady: Boolean(copy && !copy.disabled),
        exportReady: Boolean(exportPng && !exportPng.disabled)
      }
    })()`)

    if (report.canvas && report.copyReady && report.exportReady) {
      await contents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
      return
    }
    await sleep(100)
  }

  throw new Error('Timed out waiting for the documentation Treemap to finish rendering')
}

if (documentationCapture) {
  app.on('browser-window-created', (_event, window) => {
    const contents = window.webContents
    contents.on('did-finish-load', () => {
      installDocumentationStatusCompatibility(contents).catch((error) => console.error(error))
    })

    const capturePage = contents.capturePage.bind(contents)
    Object.defineProperty(contents, 'capturePage', {
      configurable: true,
      value: async (...args) => {
        await waitForTreemapFinished(contents)
        return capturePage(...args)
      }
    })
  })
}
