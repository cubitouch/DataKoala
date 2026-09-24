import assert from 'node:assert/strict'
import test from 'node:test'
import { validateExternalUrl } from './external-url.ts'
test('external URL validation permits only web URLs', () => { assert.equal(validateExternalUrl('https://grafana.example/explore'), 'https://grafana.example/explore'); for (const value of ['javascript:alert(1)', 'file:///tmp/a', 'bad']) assert.throws(() => validateExternalUrl(value)) })
