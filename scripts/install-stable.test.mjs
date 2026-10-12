import test from 'node:test'
import assert from 'node:assert/strict'
import { assertCleanWorktree, publishedStableTag } from './install-stable.mjs'

test('only published stable semver tags can be selected', () => {
  assert.equal(
    publishedStableTag({
      tag_name: 'v0.2.0',
      draft: false,
      prerelease: false,
    }),
    'v0.2.0',
  )

  for (const invalid of [
    { tag_name: 'v0.2.0', draft: true, prerelease: false },
    { tag_name: 'v0.2.0', draft: false, prerelease: true },
    { tag_name: 'v0.2.0' },
    { tag_name: 'v0.2.0-rc.1', draft: false, prerelease: false },
    { tag_name: 'main', draft: false, prerelease: false },
    { tag_name: 'v01.2.0', draft: false, prerelease: false },
    { tag_name: 'v0.2.0; echo bad', draft: false, prerelease: false },
    { tag_name: null, draft: false, prerelease: false },
    null,
  ]) {
    assert.throws(() => publishedStableTag(invalid), /approved stable/)
  }
})

test('source installation refuses to overwrite local work', () => {
  assert.doesNotThrow(() => assertCleanWorktree(''))
  assert.throws(
    () => assertCleanWorktree(' M src/main/index.ts\n'),
    /local changes or untracked files/,
  )
  assert.throws(
    () => assertCleanWorktree('?? important-notes.md\n'),
    /local changes or untracked files/,
  )
})
