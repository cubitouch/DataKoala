import assert from 'node:assert/strict'
import test from 'node:test'
import { writePngDataUrl } from './clipboard-image.ts'

const validPng = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]).toString('base64')}`

test('valid PNG bytes are converted and written to the native clipboard', () => {
  let converted = 0; let writes = 0
  const result = writePngDataUrl(validPng, {
    createFromBuffer(bytes) { converted = bytes.length; return { isEmpty: () => false } },
    writeImage() { writes++ }, logError() {}
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(converted, 9)
  assert.equal(writes, 1)
})

test('malformed and non-PNG data is rejected without a clipboard write', () => {
  let writes = 0
  for (const value of ['plain text', 'data:text/plain;base64,SGk=', 'data:image/png;base64,SGk=', 42]) {
    assert.deepEqual(writePngDataUrl(value, {
      createFromBuffer() { throw new Error('must not convert') },
      writeImage() { writes++ }, logError() {}
    }), { ok: false })
  }
  assert.equal(writes, 0)
})

test('native clipboard failures are surfaced', () => {
  let logged = false
  const result = writePngDataUrl(validPng, {
    createFromBuffer() { return { isEmpty: () => false } },
    writeImage() { throw new Error('clipboard unavailable') },
    logError() { logged = true }
  })
  assert.deepEqual(result, { ok: false })
  assert.equal(logged, true)
})
