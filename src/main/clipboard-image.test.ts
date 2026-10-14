import assert from 'node:assert/strict'
import test from 'node:test'
import { writePngDataUrl } from './clipboard-image.ts'

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
])
const validPng = `data:image/png;base64,${pngBytes.toString('base64')}`

test('valid PNG bytes are validated and written as PNG to the native clipboard', async () => {
  let converted = 0
  let written: Buffer | undefined
  const result = await writePngDataUrl(validPng, {
    createFromBuffer(bytes) {
      converted = bytes.length
      return { isEmpty: () => false }
    },
    async writePng(bytes) {
      written = bytes
    },
    logError() {},
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(converted, pngBytes.length)
  assert.deepEqual(written, pngBytes)
})

test('malformed and non-PNG data is rejected without a clipboard write', async () => {
  let writes = 0
  for (const value of [
    'plain text',
    'data:text/plain;base64,SGk=',
    'data:image/png;base64,SGk=',
    42,
  ]) {
    assert.deepEqual(
      await writePngDataUrl(value, {
        createFromBuffer() {
          throw new Error('must not convert')
        },
        async writePng() {
          writes++
        },
        logError() {},
      }),
      { ok: false },
    )
  }
  assert.equal(writes, 0)
})

test('undecodable native images are rejected before writing', async () => {
  let writes = 0
  const result = await writePngDataUrl(validPng, {
    createFromBuffer() {
      return { isEmpty: () => true }
    },
    async writePng() {
      writes++
    },
    logError() {},
  })
  assert.deepEqual(result, { ok: false })
  assert.equal(writes, 0)
})

test('clipboard success is reported only after the async write completes', async () => {
  let finishWrite!: () => void
  const write = new Promise<void>((resolve) => {
    finishWrite = resolve
  })
  let settled = false
  const result = writePngDataUrl(validPng, {
    createFromBuffer() {
      return { isEmpty: () => false }
    },
    writePng() {
      return write
    },
    logError() {},
  }).then((value) => {
    settled = true
    return value
  })
  await Promise.resolve()
  assert.equal(settled, false)
  finishWrite()
  assert.deepEqual(await result, { ok: true })
  assert.equal(settled, true)
})

test('rejected async clipboard writes return failure and are logged', async () => {
  const errors: unknown[] = []
  const result = await writePngDataUrl(validPng, {
    createFromBuffer() {
      return { isEmpty: () => false }
    },
    async writePng() {
      throw new Error('clipboard unavailable')
    },
    logError(error) {
      errors.push(error)
    },
  })
  assert.deepEqual(result, { ok: false })
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /clipboard unavailable/)
})

test('synchronous native image conversion errors return failure', async () => {
  const errors: unknown[] = []
  const result = await writePngDataUrl(validPng, {
    createFromBuffer() {
      throw new Error('decode failed')
    },
    async writePng() {
      assert.fail('should not write invalid PNG')
    },
    logError(error) {
      errors.push(error)
    },
  })
  assert.deepEqual(result, { ok: false })
  assert.equal(errors.length, 1)
})
