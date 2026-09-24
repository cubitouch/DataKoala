import assert from 'node:assert/strict'
import test from 'node:test'
import { clusterLogPatterns, LOG_PATTERN_LIMITS, type LogPatternRecord } from './log-patterns.ts'

const records = (...messages: string[]): LogPatternRecord[] => messages.map((message, index) => ({ id: String(index), message, timestampMs: 100 + index, severity: index ? 'error' : 'info' }))
const letters = (value: number) => {
  let result = ''
  for (let number = value; number >= 0; number = Math.floor(number / 26) - 1) result = String.fromCharCode(97 + number % 26) + result
  return result
}

test('normalizes common high-cardinality values', () => {
  assert.equal(clusterLogPatterns(records('Request 123 completed', 'Request 456 completed')).length, 1)
  assert.equal(clusterLogPatterns(records(
    'At 2026-01-01T10:20:30Z ip 10.2.3.4 id 550e8400-e29b-41d4-a716-446655440000',
    'At 2026-02-02T11:21:31Z ip 10.3.4.5 id 123e4567-e89b-42d3-a456-426614174000'
  )).length, 1)
})

test('clusters identifiers without merging semantic actions', () => {
  assert.equal(clusterLogPatterns(records('Failed to process order 12345 for customer abc-17', 'Failed to process order 89231 for customer def-41')).length, 1)
  assert.equal(clusterLogPatterns(records('Started worker 123', 'Stopped worker 456')).length, 2)
  assert.equal(clusterLogPatterns(records('Connection accepted for worker 123', 'Connection rejected for worker 456')).length, 2)
})

test('discovers an ordinary textual value and retains every sample', () => {
  const result = clusterLogPatterns(records('User alice failed login from 10.0.0.1', 'User bob failed login from 10.0.0.2'))
  assert.equal(result.length, 1)
  assert.equal(result[0].template, 'User <value> failed login from <ip>')
  assert.deepEqual(result[0].variables[0].values, ['alice', 'bob'])
})

test('does not match typed placeholders with incompatible values', () => {
  assert.equal(clusterLogPatterns(records('Operation completed in 123ms', 'Operation completed in failed')).length, 2)
  assert.equal(clusterLogPatterns(records('Request id 123 completed successfully now', 'Request id abc completed successfully now')).length, 2)
})

test('is deterministic and reports metadata', () => {
  const input = records('Request 123 completed', 'Request 456 completed')
  const first = clusterLogPatterns(input)
  assert.deepEqual(first, clusterLogPatterns(input))
  assert.equal(first[0].count, 2)
  assert.equal(first[0].percentage, 100)
  assert.deepEqual(first[0].memberIds, ['0', '1'])
  assert.deepEqual(first[0].severities, { info: 1, error: 1 })
  assert.equal(first[0].firstTimestampMs, 100)
  assert.equal(first[0].lastTimestampMs, 101)
})

test('handles 5,000 records', () => {
  const input = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), message: 'Processed order ' + index + ' in ' + (index % 50) + 'ms', timestampMs: index }))
  assert.equal(clusterLogPatterns(input).reduce((sum, cluster) => sum + cluster.count, 0), 5000)
})

test('keeps patterns reachable beyond a former fixed candidate limit', () => {
  const word = (index: number) => 'kind' + letters(index)
  const input = Array.from({ length: 80 }, (_, index) => ({ id: String(index), message: word(index) + ' event remained an entirely unique phrase', timestampMs: index }))
  input.push({ id: 'repeat', message: word(79) + ' event remained an entirely unique phrase', timestampMs: 100 })
  const result = clusterLogPatterns(input)
  assert.equal(result.find(({ template }) => template.startsWith(word(79)))?.count, 2)
})

test('bounds variable samples while preserving membership', () => {
  const input = Array.from({ length: 100 }, (_, index) => ({ id: String(index), message: 'Request ' + index + ' completed', timestampMs: index }))
  const result = clusterLogPatterns(input)
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 100)
  assert.equal(result[0].memberIds.length, 100)
  assert.equal(result[0].variables[0].values.length, LOG_PATTERN_LIMITS.maxVariableSamples)
})

test('handles thousands of long observability-style logs without exploding mining state', () => {
  const tail = Array.from({ length: 180 }, (_, index) => 'frame' + letters(index)).join(' ')
  const patternCount = 400
  const input: LogPatternRecord[] = Array.from({ length: 4000 }, (_, index) => {
    const pattern = index % patternCount
    const message = 'kind' + letters(pattern) + ' processing checkout request ' + index + ' in ' + (index % 97) + 'ms ' + tail + ' /srv/checkout/handler.ts'
    return { id: 'long-' + index, message, timestampMs: index, severity: index % 7 ? 'info' : 'error' }
  })
  const result = clusterLogPatterns(input)
  assert.equal(result.length, patternCount)
  assert.equal(result.reduce((sum, cluster) => sum + cluster.count, 0), input.length)
  assert.ok(result.every((cluster) => cluster.variables.every((variable) => variable.values.length <= LOG_PATTERN_LIMITS.maxVariableSamples)))
})

test('caps the representation used to mine very large messages', () => {
  const longMiddle = Array.from({ length: 2500 }, (_, index) => 'segment' + letters(index)).join(' ')
  const result = clusterLogPatterns(records(
    'Request 123 started ' + longMiddle + ' finished in 80ms',
    'Request 456 started ' + longMiddle + ' finished in 90ms'
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 2)
})


test('groups logs with several changing textual values when the surrounding structure is stable', () => {
  const result = clusterLogPatterns(records(
    'Checkout for customer alice in tenant north failed after request 12345 timed out',
    'Checkout for customer bob in tenant south failed after request 98765 timed out',
    'Checkout for customer carol in tenant west failed after request 45678 timed out'
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 3)
  assert.match(result[0].template, /customer <value> in tenant <value>/)
  assert.equal(result[0].variables.length >= 3, true)
})

test('uses key=value field names as stable structure and generalizes their values', () => {
  const result = clusterLogPatterns(records(
    'request completed service=checkout tenant=alpha request_id=req-101 duration=120ms',
    'request completed service=checkout tenant=beta request_id=req-202 duration=250ms',
    'request completed service=checkout tenant=gamma request_id=req-303 duration=180ms'
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 3)
  assert.match(result[0].template, /tenant=<value>/)
  assert.match(result[0].template, /request_id=<value>/)
  assert.match(result[0].template, /duration=<duration>/)
})

test('does not merge longer messages whose leading semantic action differs', () => {
  const result = clusterLogPatterns(records(
    'Started worker 123 after authentication completed successfully for service checkout',
    'Stopped worker 456 after authentication completed successfully for service checkout'
  ))
  assert.equal(result.length, 2)
})

test('candidate discovery is position independent for stable semantic words', () => {
  const result = clusterLogPatterns(records(
    'Payment for customer alice on tenant north request 12345 failed with downstream timeout',
    'Payment for customer bob on tenant south request 98765 failed with downstream timeout'
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 2)
})


test('clusters JSON objects by canonical key structure regardless of key order or nullable values', () => {
  const result = clusterLogPatterns(records(
    '{"service":"checkout","tenant":"alpha","request_id":"req-101","attempt":2}',
    '{"request_id":"req-202","attempt":null,"tenant":"beta","service":"checkout"}',
    '{"tenant":null,"service":"checkout","attempt":5,"request_id":"req-303"}'
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 3)
  assert.match(result[0].template, /attempt=<value>/)
  assert.match(result[0].template, /request_id=<value>/)
  assert.match(result[0].template, /tenant=<value>/)
})

test('clusters Python dictionary strings and treats None like any other value for the same key', () => {
  const result = clusterLogPatterns(records(
    "{'service': 'checkout', 'tenant': 'alpha', 'request_id': 'req-101', 'retry': True}",
    "{'request_id': 'req-202', 'retry': None, 'tenant': 'beta', 'service': 'checkout'}",
    "{'tenant': None, 'service': 'checkout', 'retry': False, 'request_id': 'req-303'}"
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 3)
  assert.match(result[0].template, /retry=<value>/)
  assert.match(result[0].template, /tenant=<value>/)
})

test('flattens nested JSON and Python dictionaries into stable key paths', () => {
  const result = clusterLogPatterns(records(
    '{"event":"checkout","user":{"id":123,"profile":{"region":"fr"}},"result":{"code":200}}',
    "{'result': {'code': None}, 'user': {'profile': {'region': 'uk'}, 'id': 456}, 'event': 'checkout'}"
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 2)
  assert.match(result[0].template, /result\.code=<value>/)
  assert.match(result[0].template, /user\.id=<value>/)
  assert.match(result[0].template, /user\.profile\.region=<value>/)
})

test('parses quoted commas and colons inside structured string values', () => {
  const result = clusterLogPatterns(records(
    '{"message":"failed: downstream, timed out","service":"checkout","context":{"note":"a,b:c"}}',
    "{'context': {'note': 'x,y:z'}, 'service': 'checkout', 'message': 'failed: upstream, timed out'}"
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 2)
})

test('keeps structured objects with different key shapes separate', () => {
  const result = clusterLogPatterns(records(
    '{"service":"checkout","tenant":"alpha","request_id":"req-101"}',
    '{"service":"checkout","tenant":"alpha","trace_id":"trace-101"}'
  ))
  assert.equal(result.length, 2)
})

test('treats nullable key=value fields as compatible with typed values', () => {
  const result = clusterLogPatterns(records(
    'request completed service=checkout duration=120ms retry=2',
    'request completed service=checkout duration=null retry=None',
    'request completed service=checkout duration=250ms retry=3'
  ))
  assert.equal(result.length, 1)
  assert.equal(result[0].count, 3)
  assert.match(result[0].template, /duration=<value>/)
  assert.match(result[0].template, /retry=<value>/)
})
