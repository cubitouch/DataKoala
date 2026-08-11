/**
 * Full-flow smoke test: drives the real UI in Electron the way a user does —
 * paste a connection string, save, connect, type a query, click Run — and asserts
 * rows land in the table and a chart canvas renders.
 *
 * This is the test that would have caught "click Run and nothing happens": the
 * unit and DB-layer tests all passed while the actual UI flow was broken.
 *
 * Usage: pnpm smoke:flow   (needs `pnpm db:up` and `pnpm build`)
 */
import { spawn } from 'node:child_process'

const CONN =
  process.env.DATAKOALA_TEST_DB ?? 'postgresql://postgres:testpw@localhost:55432/datakoala_test'
const electronBin = 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'

const child = spawn(electronBin, ['.'], {
  env: { ...process.env, DATAKOALA_REPRO: CONN },
  stdio: ['ignore', 'pipe', 'pipe']
})

let out = ''
let err = ''
child.stdout.on('data', (d) => {
  out += d
  process.stdout.write(d)
})
child.stderr.on('data', (d) => {
  err += d
})

const timer = setTimeout(() => child.kill('SIGTERM'), 45000)
child.on('exit', () => {
  clearTimeout(timer)
  const cleanedErr = err
    .split('\n')
    .filter((l) => l.trim() && !/VizNullHypothesis/.test(l))
    .join('\n')
  if (cleanedErr) console.log('--- stderr ---\n' + cleanedErr)

  // The JSON block is followed by other log lines before the marker, so match the
  // braces rather than assuming the marker comes next.
  let report = null
  const start = out.indexOf('REPRO_REPORT ')
  if (start !== -1) {
    const jsonStart = out.indexOf('{', start)
    // Walk to the matching close brace.
    let depth = 0
    let end = -1
    for (let i = jsonStart; i < out.length; i++) {
      if (out[i] === '{') depth++
      else if (out[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end !== -1) {
      try {
        report = JSON.parse(out.slice(jsonStart, end + 1))
      } catch {
        report = null
      }
    }
  }

  // A custom query is expected to return a different shape, so only assert on the
  // default query's row count.
  const isDefaultQuery = !process.env.DATAKOALA_REPRO_SQL

  const problems = []
  if (!report) problems.push('no report produced')
  else {
    if (!report.connected) problems.push('did not connect')
    if (!report.activeProfileId) problems.push('activeProfileId is falsy — Run would silently no-op')
    if (report.queryError) problems.push('query error: ' + report.queryError)
    if (!report.rowCount) problems.push('query returned no rows')
    if (isDefaultQuery && report.domTableRows !== 25) {
      problems.push(`expected 25 table rows, got ${report.domTableRows}`)
    }
    if (!report.domTableRows) problems.push('no rows rendered in the table')
    if (!report.hasChartCanvas) problems.push('chart canvas did not render')
    if (report.chart && !report.chart.yField) problems.push('no Y field was auto-selected')
    // The Format button must exist and actually reformat.
    if (!report.formatCheck?.found) problems.push('Format button not found')
    else if (!report.formatCheck.changed) problems.push('Format button did not change the SQL')
    // A timestamp X axis must be a real time axis carrying [x, y] pairs.
    const p = report.chartProbe
    if (p) {
      if (p.isTimeAxis) {
        if (p.xAxisType !== 'time') problems.push(`time column gave xAxis.type=${p.xAxisType}`)
        if (p.xAxisHasData) problems.push('time axis should not set xAxis.data')
        if (!p.pointsArePairs) problems.push('time axis series must carry [x, y] pairs')
      } else if (p.xAxisType !== 'category') {
        problems.push(`non-time column gave xAxis.type=${p.xAxisType}`)
      }
    }
  }

  if (problems.length) {
    console.error('\nflow smoke: FAIL\n - ' + problems.join('\n - '))
    process.exit(1)
  }
  console.log('\nflow smoke: PASS')
  process.exit(0)
})
