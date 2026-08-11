/**
 * Database integration smoke test.
 *
 * Boots the built Electron main process against a real Postgres and exercises the
 * actual db.ts layer: connect, introspect, query, explain, read-only enforcement.
 *
 * Usage:
 *   pnpm db:up          # start + seed a throwaway Postgres container
 *   pnpm build
 *   pnpm smoke:db
 *   pnpm db:down
 *
 * Override the target with DATAKOALA_TEST_DB=postgresql://...
 */
import { spawn } from 'node:child_process'

const CONN = process.env.DATAKOALA_TEST_DB ?? 'postgresql://postgres:testpw@localhost:55432/datakoala_test'
const electronBin = 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'

const child = spawn(electronBin, ['.'], {
  env: { ...process.env, DATAKOALA_DB_SMOKE: CONN },
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
  console.error('timed out waiting for the database smoke test')
  child.kill('SIGTERM')
}, 30000)

child.on('exit', (code, sig) => {
  clearTimeout(timer)
  const combined = out + err
  console.log(
    out
      .split('\n')
      .filter((l) => l.trim())
      .join('\n')
  )
  const cleanedErr = err
    .split('\n')
    .filter((l) => l.trim() && !/VizNullHypothesis/.test(l))
    .join('\n')
  if (cleanedErr) console.log('--- stderr ---\n' + cleanedErr)

  if (/DBSMOKE_OK/.test(combined) && !/DBSMOKE_FAIL/.test(combined)) {
    console.log('\ndatabase smoke: PASS')
    process.exit(0)
  }
  console.error(`\ndatabase smoke: FAIL (exit=${code} signal=${sig})`)
  process.exit(1)
})
