/**
 * Brings up a throwaway Postgres for the e2e / smoke tests and seeds it.
 *
 * Also grants trust auth to the proxy-style role created by test/seed.sql, so
 * the passwordless connection-string path can be tested for real.
 *
 * Usage: pnpm db:up   /   pnpm db:down
 */
import { execFileSync, execSync } from 'node:child_process'

const NAME = 'datakoala-test'
const PORT = process.env.DATAKOALA_TEST_PORT ?? '55432'
const DB = 'datakoala_test'
const SPECIAL_ROLE = 'demo-reader@proxy-test.example'

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const quiet = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' }).toString()

function alreadyRunning() {
  try {
    return quiet('docker', ['ps', '-q', '-f', `name=^${NAME}$`]).trim() !== ''
  } catch {
    return false
  }
}

if (alreadyRunning()) {
  console.log(`${NAME} is already running; removing it first`)
  try {
    run('docker', ['stop', NAME])
  } catch {
    /* ignore */
  }
}

console.log(`starting postgres on :${PORT}`)
run('docker', [
  'run', '-d', '--rm',
  '--name', NAME,
  '-e', 'POSTGRES_PASSWORD=testpw',
  '-e', `POSTGRES_DB=${DB}`,
  '-p', `${PORT}:5432`,
  'postgres:16-alpine'
])

// Wait for readiness.
process.stdout.write('waiting for postgres')
const deadline = Date.now() + 60_000
for (;;) {
  try {
    execFileSync('docker', ['exec', NAME, 'pg_isready', '-U', 'postgres', '-d', DB], { stdio: 'ignore' })
    console.log(' ready')
    break
  } catch {
    if (Date.now() > deadline) {
      console.error('\ntimed out waiting for postgres')
      process.exit(1)
    }
    process.stdout.write('.')
    await new Promise((r) => setTimeout(r, 500))
  }
}

console.log('seeding test/seed.sql')
execSync(`docker exec -i ${NAME} psql -U postgres -d ${DB} -v ON_ERROR_STOP=1 < test/seed.sql`, {
  stdio: ['inherit', 'inherit', 'inherit'],
  shell: '/bin/sh'
})

// Let the special role in without a password, mimicking a proxy/IAM setup.
console.log(`granting trust auth to "${SPECIAL_ROLE}"`)
const hbaLine = `host all "${SPECIAL_ROLE}" all trust`
run('docker', [
  'exec', NAME, 'sh', '-c',
  `PGDATA=/var/lib/postgresql/data; grep -qF '${SPECIAL_ROLE}' $PGDATA/pg_hba.conf || sed -i '1i ${hbaLine}' $PGDATA/pg_hba.conf`
])
run('docker', ['exec', NAME, 'psql', '-U', 'postgres', '-q', '-c', 'select pg_reload_conf();'])

console.log(`\nready: postgresql://postgres:testpw@localhost:${PORT}/${DB}`)
console.log(`passwordless: postgres://${encodeURIComponent(SPECIAL_ROLE)}@localhost:${PORT}/${DB}`)
