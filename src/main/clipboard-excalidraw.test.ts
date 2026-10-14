import assert from 'node:assert/strict'
import test from 'node:test'
import { writeExcalidrawClipboard } from './clipboard-excalidraw.ts'

const scene = JSON.stringify({
  type: 'excalidraw/clipboard',
  elements: [{ id: 'node-1' }],
  files: {},
})

test('valid Excalidraw scenes preserve their envelope and verify clipboard readback', async () => {
  let written = ''
  let read = 0
  const result = await writeExcalidrawClipboard(scene, {
    async writeText(text) {
      written = text
    },
    async readText() {
      read++
      return written
    },
    logError() {},
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(written, scene)
  assert.equal(read, 1)
})

test('invalid scenes are rejected before any clipboard operation', async () => {
  let calls = 0
  for (const value of [
    42,
    '{not valid JSON}',
    JSON.stringify({ type: 'other', elements: [] }),
    JSON.stringify({ type: 'excalidraw/clipboard', elements: null }),
    'a'.repeat(20_000_001),
  ]) {
    const result = await writeExcalidrawClipboard(value, {
      async writeText() {
        calls++
      },
      async readText() {
        calls++
        return ''
      },
      logError() {},
    })
    assert.deepEqual(result, { ok: false })
  }
  assert.equal(calls, 0)
})

test('clipboard readback mismatch is not reported as a successful copy', async () => {
  const result = await writeExcalidrawClipboard(scene, {
    async writeText() {},
    async readText() {
      return 'other clipboard content'
    },
    logError() {},
  })
  assert.deepEqual(result, { ok: false })
})

test('asynchronous write and read failures are logged and reported', async () => {
  for (const failure of ['write', 'read'] as const) {
    let logged: unknown
    const result = await writeExcalidrawClipboard(scene, {
      async writeText() {
        if (failure === 'write') throw new Error('write failed')
      },
      async readText() {
        if (failure === 'read') throw new Error('read failed')
        return scene
      },
      logError(error) {
        logged = error
      },
    })
    assert.deepEqual(result, { ok: false })
    assert.match(String(logged), new RegExp(`${failure} failed`))
  }
})

test('copy awaits the asynchronous write before verifying or reporting success', async () => {
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  let read = 0
  let settled = false
  const result = writeExcalidrawClipboard(scene, {
    writeText: () => pending,
    async readText() {
      read++
      return scene
    },
    logError() {},
  }).then((value) => {
    settled = true
    return value
  })
  await Promise.resolve()
  assert.equal(read, 0)
  assert.equal(settled, false)
  finish()
  assert.deepEqual(await result, { ok: true })
  assert.equal(read, 1)
})
