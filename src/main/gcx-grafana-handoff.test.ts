import assert from 'node:assert/strict'
import test from 'node:test'
import { grafanaTargetFromConfig, resolveGcxGrafanaHandoff } from './gcx-grafana-handoff.ts'
import type { GcxCommandRunner } from './gcx-command.ts'

test('reads legacy context-local Grafana configuration', () => {
  assert.deepEqual(grafanaTargetFromConfig({
    'current-context': 'prod',
    contexts: { prod: { grafana: { server: 'https://prod.grafana.net/', 'org-id': 3 } } }
  }), { context: 'prod', baseUrl: 'https://prod.grafana.net', orgId: 3 })
})

test('reads gcx v1 stack-backed Grafana configuration', () => {
  assert.deepEqual(grafanaTargetFromConfig({
    contexts: { staging: { stack: 'stack-staging' } },
    stacks: { 'stack-staging': { grafana: { server: 'https://staging.grafana.example', orgId: 7 } } }
  }, 'staging'), { context: 'staging', baseUrl: 'https://staging.grafana.example', orgId: 7 })
})

test('resolves the Grafana destination and a unique compatible datasource without persisting profile changes', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    if (args[0] === 'config') return { stdout: JSON.stringify({ 'current-context': 'prod', contexts: { prod: { grafana: { server: 'https://prod.grafana.net' } } } }), stderr: '' }
    return { stdout: JSON.stringify([
      { uid: 'logs', type: 'loki', name: 'Logs' },
      { uid: 'traces', type: 'tempo', name: 'Traces' }
    ]), stderr: '' }
  }
  assert.deepEqual(await resolveGcxGrafanaHandoff({ signal: 'tempo' }, run), {
    baseUrl: 'https://prod.grafana.net',
    datasourceUid: 'traces',
    datasourceType: 'tempo'
  })
  assert.deepEqual(calls, [
    ['config', 'view', '-o', 'json'],
    ['api', '/api/datasources', '--context', 'prod', '-o', 'json']
  ])
})


test('falls back to gcx current-context when a multi-context config does not expose the active name', async () => {
  const run: GcxCommandRunner = async (args) => {
    if (args.join(' ') === 'config view -o json') return {
      stdout: JSON.stringify({
        contexts: {
          prod: { grafana: { server: 'https://prod.grafana.net' } },
          staging: { grafana: { server: 'https://staging.grafana.net' } }
        }
      }),
      stderr: ''
    }
    if (args.join(' ') === 'config current-context') return { stdout: 'staging\n', stderr: '' }
    return { stdout: JSON.stringify([{ uid: 'logs-staging', type: 'loki', name: 'Logs' }]), stderr: '' }
  }
  assert.deepEqual(await resolveGcxGrafanaHandoff({ signal: 'loki' }, run), {
    baseUrl: 'https://staging.grafana.net',
    datasourceUid: 'logs-staging',
    datasourceType: 'loki'
  })
})


test('uses a gcx context default datasource before requiring a unique signal datasource', async () => {
  const run: GcxCommandRunner = async (args) => {
    if (args[0] === 'config') return {
      stdout: JSON.stringify({
        'current-context': 'prod',
        contexts: { prod: { grafana: { server: 'https://prod.grafana.net' }, datasources: { tempo: 'tempo-preferred' } } }
      }),
      stderr: ''
    }
    return {
      stdout: JSON.stringify([
        { uid: 'tempo-other', type: 'tempo', name: 'Other traces' },
        { uid: 'tempo-preferred', type: 'tempo', name: 'Preferred traces' }
      ]),
      stderr: ''
    }
  }

  const result = await resolveGcxGrafanaHandoff({ signal: 'tempo' }, run)
  assert.equal(result.datasourceUid, 'tempo-preferred')
  assert.equal(result.datasourceType, 'tempo')
})
