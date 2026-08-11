import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'

const dir = await mkdtemp(join(tmpdir(), 'datakoala-sqlite-electron-'))
const fixture = join(dir, 'smoke.sqlite3')
execFileSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table smoke_data(value text)'); c.executemany('insert into smoke_data values (?)',[('one',),('two',)]); c.commit(); c.close()", fixture])
const beforeStat = await stat(fixture, { bigint: true })
const beforeHash = createHash('sha256').update(await readFile(fixture)).digest('hex')
const executable = process.env.DATAKOALA_ELECTRON_BIN || electronPath
const child = spawn(executable, process.env.DATAKOALA_ELECTRON_BIN ? [] : ['.'], {
  env: { ...process.env, DATAKOALA_SQLITE_SMOKE: fixture }, stdio: ['ignore', 'pipe', 'pipe']
})
let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })
const timeout = setTimeout(() => child.kill('SIGTERM'), 30_000)
child.on('exit', async (code) => {
  clearTimeout(timeout)
  const afterStat = await stat(fixture, { bigint: true })
  const afterHash = createHash('sha256').update(await readFile(fixture)).digest('hex')
  const unchanged = beforeHash === afterHash && beforeStat.size === afterStat.size && beforeStat.mtimeNs === afterStat.mtimeNs
  await rm(dir, { recursive: true, force: true })
  if (code === 0 && /SQLITE_ELECTRON_SMOKE_OK/.test(output) && unchanged) {
    console.log(output.trim()); console.log('SQLITE_ORIGINAL_UNCHANGED'); process.exit(0)
  }
  console.error(output.trim()); console.error(`SQLITE_ELECTRON_SMOKE_FAIL code=${code} unchanged=${unchanged}`); process.exit(1)
})
