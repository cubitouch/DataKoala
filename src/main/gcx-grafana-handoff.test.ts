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
