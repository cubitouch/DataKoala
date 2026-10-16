import { describe, expect, it } from 'vitest'
import { formatLogFieldValue, logFieldCopyText } from './logFieldValue'

describe('Loki inspector values', () => {
  it('distinguishes arrays, objects and strings with readable JSON', () => {
    expect(
      formatLogFieldValue({ provider: 'gateway', retries: [1, 2] }),
    ).toMatchObject({ kind: 'Object', truncated: false })
    expect(formatLogFieldValue([1, { ok: true }]).text).toContain('"ok": true')
    expect(formatLogFieldValue([])).toMatchObject({ kind: 'Array', text: '[]' })
    expect(formatLogFieldValue({})).toMatchObject({
      kind: 'Object',
      text: '{}',
    })
    expect(formatLogFieldValue('[1,2]')).toMatchObject({
      kind: 'Value',
      text: '[1,2]',
    })
  })
  it('bounds deep, wide and long display while copying the complete underlying payload', () => {
    const value = {
      long: 'x'.repeat(10000),
      array: Array.from({ length: 1000 }, (_, i) => ({ i })),
      deep: { a: { b: { c: { d: 1 } } } },
    }
    const preview = formatLogFieldValue(value)
    expect(preview.truncated).toBe(true)
    expect(preview.text.length).toBeLessThanOrEqual(2001)
    expect(logFieldCopyText(value)).toBe(JSON.stringify(value))
    expect(logFieldCopyText('x'.repeat(10000))).toHaveLength(10000)
  })
  it('handles primitives and unexpected non-JSON shapes without throwing or mutation', () => {
    for (const value of [null, undefined, 0, false, 1n, NaN])
      expect(() => formatLogFieldValue(value)).not.toThrow()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(formatLogFieldValue(circular).text).toContain('Circular')
    expect(logFieldCopyText(circular)).toBe('[Unserializable object]')
    expect(logFieldCopyText(null)).toBe('null')
    expect(logFieldCopyText(false)).toBe('false')
    expect(logFieldCopyText({ a: [1, 'x'] })).toBe('{"a":[1,"x"]}')
  })
})
