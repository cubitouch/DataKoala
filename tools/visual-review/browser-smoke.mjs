/**
 * Optional real-browser smoke without Playwright/Puppeteer dependencies.
 * Uses Chrome DevTools Protocol with Node 24's native WebSocket.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './serve.mjs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(getValue, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const value = await getValue()
      if (value) return value
    } catch { /* Chrome/page may still be starting */ }
    await sleep(150)
  }
  throw new Error('Timed out: ' + label)
}
function locateBrowser() {
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    .find(name => spawnSync('which', [name]).status === 0)
}
async function connect(wsURL) {
  const ws = new WebSocket(wsURL)
  const pending = new Map()
  let sequence = 0
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id)
      clearTimeout(timeout)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    } else if (message.method === 'Page.javascriptDialogOpening') {
      call('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
    }
  })
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')) }, 15000)
      pending.set(id, { resolve, reject, timeout })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ' ' + (response.exceptionDetails.exception?.description || ''))
    return response.result.value
  }
  return { ws, call, evaluate }
}
export async function smokeBrowser() {
  const browser = locateBrowser()
  if (!browser) {
    console.log('VIS-01 browser smoke SKIPPED: Chrome/Chromium is not installed. Node tests still run.')
    return false
  }
  const temp = await mkdtemp(join(tmpdir(), 'vis01-browser-'))
  const profile = join(temp, 'profile')
  const server = await startServer({ port: 0 })
  const origin = 'http://127.0.0.1:' + server.address().port
  let chrome
  let session
  try {
    chrome = spawn(browser, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, 'about:blank',
    ], { stdio: 'ignore' })
    const debugPort = await until(async () => {
      const raw = await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      return Number(raw.split('\n')[0])
    }, 'Chrome debugger')
    const targets = await until(async () => {
      const items = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()
      return items.find(target => target.type === 'page')
    }, 'Chrome page')
    session = await connect(targets.webSocketDebuggerUrl)
    const { call, evaluate } = session
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Page.navigate', { url: origin })
    await until(async () => await evaluate("document.querySelectorAll('#queue [data-review]').length === 18"), 'review queue')
    assert.equal(await evaluate("document.querySelector('#source-info').textContent.includes('23 real')"), true)
    await evaluate("document.querySelector('[data-review=\"VIS-03\"]').click()")
    await until(async () => await evaluate("document.querySelector('#notes') !== null"), 'review form')
    await until(async () => await evaluate("Array.from(document.querySelectorAll('.gallery img')).every(img => img.complete && img.naturalWidth > 0)"), 'native images')
    await evaluate("Array.from(document.querySelectorAll('input[name=\"review-decision\"]')).find(x => x.value === 'Request redesign').click()")
    await evaluate("(() => { const n=document.getElementById('notes'); n.value='VIS-01 browser workflow: redesign dialog focus'; n.dispatchEvent(new Event('input',{bubbles:true})) })()")
    const stored = JSON.parse(await evaluate("localStorage.getItem('datakoala.vis01.decisions.v1')"))
    assert.equal(stored.decisions['VIS-03'].choice, 'Request redesign')
    assert.match(stored.decisions['VIS-03'].notes, /redesign dialog focus/)
    await evaluate("document.querySelector('.image-hit').click()")
    assert.equal(await evaluate("document.getElementById('zoom-dialog').open"), true)
    await evaluate("document.getElementById('zoom-close').click()")
    assert.equal(await evaluate("document.getElementById('zoom-dialog').open"), false)
    await call('Page.reload', { ignoreCache: true })
    await until(async () => await evaluate("document.querySelector('#notes')?.value === 'VIS-01 browser workflow: redesign dialog focus'"), 'reload/notes persistence')
    assert.equal(await evaluate("Array.from(document.querySelectorAll('input[name=\"review-decision\"]')).find(x => x.value === 'Request redesign').checked"), true)
    await evaluate("(() => { const f=document.getElementById('provider'); f.value='Loki'; f.dispatchEvent(new Event('change',{bubbles:true})) })()")
    const filteredCount = await evaluate("document.querySelectorAll('#queue [data-review]').length")
    assert.ok(filteredCount > 0 && filteredCount < 18, 'Provider filter should narrow the queue')
    await evaluate("(() => { const f=document.getElementById('provider'); f.value=''; f.dispatchEvent(new Event('change',{bubbles:true})) })()")
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: temp })
    await evaluate("document.getElementById('export-json').click()")
    const exportedFile = join(temp, 'datakoala-vis01-decisions.json')
    const exported = await until(async () => {
      const raw = await readFile(exportedFile, 'utf8')
      try { return JSON.parse(raw) } catch { return null }
    }, 'browser JSON export')
    assert.equal(exported.decisions['VIS-03'].choice, 'Request redesign')
    await evaluate("Array.from(document.querySelectorAll('input[name=\"review-decision\"]')).find(x => x.value === 'Defer').click()")
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('datakoala.vis01.decisions.v1')).decisions['VIS-03'].choice"), 'Defer')
    // Use CDP's trusted file selector rather than inventing a browser File object.
    await call('DOM.enable')
    const root = await call('DOM.getDocument')
    const input = await call('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#import' })
    await call('DOM.setFileInputFiles', { files: [exportedFile], nodeId: input.nodeId })
    await until(async () => await evaluate("JSON.parse(localStorage.getItem('datakoala.vis01.decisions.v1')).decisions['VIS-03'].choice === 'Request redesign'"), 'browser import and confirmation')
    assert.equal(await evaluate("document.getElementById('notes').value"), 'VIS-01 browser workflow: redesign dialog focus')
    console.log('VIS-01 browser smoke PASSED: real UI, 18 cards, PNG decode, radio+notes, zoom, reload, filters, JSON download/import.')
    return true
  } finally {
    session?.ws.close()
    chrome?.kill('SIGTERM')
    await new Promise(resolve => server.close(resolve))
    await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 })
  }
}
if (process.argv[1]?.endsWith('/browser-smoke.mjs')) {
  try { await smokeBrowser() }
  catch (error) { console.error(error); process.exitCode = 1 }
}
