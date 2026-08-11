/**
 * Launch the built main process in Electron and prove the host-specific DuckDB
 * native addon can be selected and loaded. This catches bundler/platform issues
 * that a successful electron-vite build cannot detect.
 */
import { spawn } from 'node:child_process'
import electronPath from 'electron'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const mainBundle = resolve('out/main/index.js')
const built = await readFile(mainBundle, 'utf8')
if (!built.includes('require("@duckdb/node-api")') && !built.includes("require('@duckdb/node-api')")) {
  console.error('DUCKDB_SMOKE_FAIL main bundle does not keep @duckdb/node-api external')
  process.exit(1)
}
if (/node-bindings-(?:linux|darwin|win32)-/.test(built)) {
  console.error('DUCKDB_SMOKE_FAIL main bundle contains a platform-specific DuckDB binding')
  process.exit(1)
}

const executable = process.env.DATAKOALA_ELECTRON_BIN || electronPath
const child = spawn(executable, process.env.DATAKOALA_ELECTRON_BIN ? [] : ['.'], {
  env: { ...process.env, DATAKOALA_DUCKDB_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})
let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const timeout = setTimeout(() => child.kill('SIGTERM'), 20_000)
child.on('error', (error) => {
  clearTimeout(timeout)
  console.error('DUCKDB_SMOKE_FAIL could not launch Electron', error)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  clearTimeout(timeout)
  if (/DUCKDB_SMOKE_OK SELECT 42/.test(output) && code === 0) {
    console.log(output.trim())
    process.exit(0)
  }
  console.error(output.trim())
  console.error(`DUCKDB_SMOKE_FAIL Electron exited with code=${code} signal=${signal}`)
  process.exit(1)
})
