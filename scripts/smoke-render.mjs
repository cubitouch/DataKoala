/**
 * Renderer smoke test: boots the built Electron app, waits for the React tree to
 * mount, and asserts the key panels and the preload bridge are present.
 * Exits non-zero if the window fails to render.
 *
 * Usage: pnpm smoke   (requires `pnpm build` first)
 * Headless Linux: xvfb-run --auto-servernum pnpm smoke --no-sandbox
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'

const userData = await mkdtemp(join(tmpdir(), 'datakoala-renderer-smoke-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  env: {
    ...env,
    DATAKOALA_SMOKE: '1',
    DATAKOALA_SMOKE_USER_DATA: userData,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let out = ''
let err = ''
let timedOut = false
let launchError = null
child.stdout.on('data', (d) => {
  out += d
})
child.stderr.on('data', (d) => {
  err += d
})

const timer = setTimeout(() => {
  timedOut = true
  console.error('timed out waiting for the renderer to report')
  child.kill('SIGTERM')
}, 20000)

child.on('error', (error) => {
  launchError = error
  clearTimeout(timer)
})

child.on('close', async (code, sig) => {
  clearTimeout(timer)
  await rm(userData, { recursive: true, force: true })
  const combined = out + err
  // Electron logs a benign GPU warning on macOS; ignore it.
  const noise = /VizNullHypothesis/
  const cleanedErr = err
    .split('\n')
    .filter((l) => l.trim() && !noise.test(l))
    .join('\n')

  console.log(out.trim())
  if (cleanedErr) console.log('--- stderr ---\n' + cleanedErr)

  const ok = /SMOKE_OK/.test(combined)
  const failed = /SMOKE_FAIL/.test(combined)
  if (launchError) console.error('Could not launch Electron:', launchError)
  if (code === 0 && !timedOut && !launchError && ok && !failed) {
    console.log('\nrenderer smoke: PASS')
    process.exit(0)
  }
  console.error(`\nrenderer smoke: FAIL (exit=${code} signal=${sig})`)
  process.exit(1)
})
