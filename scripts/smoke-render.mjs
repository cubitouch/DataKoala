/**
 * Renderer smoke test: boots the built Electron app, waits for the React tree to
 * mount, and asserts the key panels and the preload bridge are present.
 * Exits non-zero if the window fails to render.
 *
 * Usage: pnpm smoke   (requires `pnpm build` first)
 */
import { spawn } from 'node:child_process'

const electronBin = 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'

const child = spawn(electronBin, ['.'], {
  env: { ...process.env, DATAKOALA_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let out = ''
let err = ''
child.stdout.on('data', (d) => {
  out += d
})
child.stderr.on('data', (d) => {
  err += d
})

const timer = setTimeout(() => {
  console.error('timed out waiting for the renderer to report')
  child.kill('SIGTERM')
}, 20000)

child.on('exit', (code, sig) => {
  clearTimeout(timer)
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
  if (ok && !failed) {
    console.log('\nrenderer smoke: PASS')
    process.exit(0)
  }
  console.error(`\nrenderer smoke: FAIL (exit=${code} signal=${sig})`)
  process.exit(1)
})
