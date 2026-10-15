import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import type { LocalFilesProfile } from '../../shared/types.ts'
import { queryFailureKind } from '../query-failure.ts'
import { LocalFilesAdapter, quoteLiteral } from './local-files-adapter.ts'

async function fingerprint(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

test('NON-04: selected symlink, TSV and JSONL are readable without granting neighbouring files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'datakoala-non04-files-'))
  const original = join(dir, 'chosen.csv')
  const selectedLink = join(dir, 'chosen-link.csv')
  const tsv = join(dir, 'chosen.tsv')
  const jsonl = join(dir, 'chosen.jsonl')
  const unselected = join(dir, 'private.csv')
  const unselectedLink = join(dir, 'private-link.csv')
  const exportPath = join(dir, 'must-not-exist.csv')
  try {
    await writeFile(original, 'id,label\n1,visible\n')
    await writeFile(tsv, 'id\tlabel\n2\ttabbed\n')
    await writeFile(jsonl, '{"label":"first","score":1}\n{"label":"second","score":2}\n')
    await writeFile(unselected, 'secret\nprivate\n')
    await symlink(original, selectedLink)
    await symlink(unselected, unselectedLink)

    const beforeSelected = await fingerprint(original)
    const beforeUnselected = await fingerprint(unselected)
    const profile: LocalFilesProfile = {
      kind: 'local-files',
      version: 1,
      id: 'non04-file-fixture',
      name: 'NON-04 fixture',
      readonly: true,
      files: [
        { path: selectedLink, alias: 'csv_data' },
        { path: tsv, alias: 'tsv_data' },
        { path: jsonl, alias: 'jsonl_data' },
      ],
    }
    const connected = await new LocalFilesAdapter().connect(profile)
    assert.equal(
      connected.result.ok,
      true,
      connected.result.ok ? undefined : connected.result.error,
    )
    const session = connected.session
    assert.ok(session)
    try {
      assert.deepEqual(
        (await session.listRelations()).map((r) => r.name),
        ['csv_data', 'tsv_data', 'jsonl_data'],
      )
      const selected = await session.query({
        sql: "/* comment; */ SELECT ';' AS punctuation, label FROM csv_data",
      })
      assert.deepEqual(selected.rows, [
        { punctuation: ';', label: 'visible' },
      ])
      assert.equal(
        (await session.query({ sql: 'SELECT label FROM tsv_data' })).rows[0].label,
        'tabbed',
      )
      const jsonRows = await session.query({
        sql: 'SELECT label FROM jsonl_data ORDER BY label',
      })
      assert.deepEqual(jsonRows.rows.map((r) => r.label), ['first', 'second'])

      // An explicitly selected symlink resolves to its canonical allowlisted file.
      const canonical = await realpath(original)
      const direct = await session.query({
        sql: `SELECT COUNT(*) AS total FROM read_csv_auto(${quoteLiteral(canonical)})`,
      })
      assert.equal(Number(direct.rows[0].total), 1)

      for (const path of [unselected, unselectedLink]) {
        await assert.rejects(
          session.query({
            sql: `SELECT * FROM read_csv_auto(${quoteLiteral(path)})`,
          }),
          (error) =>
            queryFailureKind(error) === 'validation' &&
            /file system operations are disabled/i.test(
              error instanceof Error ? error.message : '',
            ),
          path,
        )
      }
      for (const sql of [
        'SELECT 1; SELECT 2',
        'DELETE FROM csv_data',
        'INSERT INTO csv_data VALUES (3, \'not allowed\')',
        `COPY (SELECT 1) TO ${quoteLiteral(exportPath)}`,
        'SET enable_external_access = true',
      ]) {
        await assert.rejects(
          session.query({ sql }),
          (error) => queryFailureKind(error) === 'validation',
          sql,
        )
      }
    } finally {
      await session.close()
    }
    assert.equal(await fingerprint(original), beforeSelected)
    assert.equal(await fingerprint(unselected), beforeUnselected)
    await assert.rejects(stat(exportPath), /ENOENT/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
