import assert from 'node:assert/strict'
import test from 'node:test'
import { assertReadOnlyBigQueryScript } from './bigquery-script.ts'

test('allows local variables, tuple assignments, subqueries, CTEs and multiple SELECTs', () => {
  for (const sql of [
    'DECLARE start_date DATE DEFAULT DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY); SET start_date = CURRENT_DATE(); SELECT start_date;',
    'DECLARE x, y INT64; SET (x, y) = (1, 2); SELECT x; SELECT y;',
    'DECLARE x DEFAULT (SELECT MAX(id) FROM t); SET x = (SELECT MIN(id) FROM t); WITH data AS (SELECT x) SELECT * FROM data;',
    '# a comment; DELETE\n declare x INT64; /* ; DROP */ set x = 2; select x; -- done;',
    'DECLARE `value` INT64; SET `value` = 2; SELECT `value`;',
    'SELECT 1; SELECT 2;'
  ]) assert.doesNotThrow(() => assertReadOnlyBigQueryScript(sql), sql)
})

test('handles semicolons and keywords inside GoogleSQL literals and identifiers', () => {
  for (const literal of [
    "'a; DELETE FROM t; -- b'", '"a; DROP TABLE t; # b"',
    "'''it's; a multi\nline string'''", '"""a; multi\nline "string"""',
    "r'\\d+; DROP'", "br'''\\w+; UPDATE'''", "b'bytes; INSERT'",
    "'escaped\\'; DELETE; still a string'", '`project.dataset.table;name`'
  ]) assert.doesNotThrow(() => assertReadOnlyBigQueryScript(`DECLARE x INT64; SELECT ${literal};`), literal)
})

test('rejects writes, execution, control flow, system assignments and scripts without a final SELECT', () => {
  for (const statement of [
    'INSERT INTO t VALUES (1)', 'UPDATE t SET x = 1', 'DELETE FROM t WHERE TRUE',
    'MERGE t USING s ON FALSE WHEN NOT MATCHED THEN INSERT ROW',
    'CREATE TEMP TABLE t AS SELECT 1', 'DROP TABLE t', 'ALTER TABLE t ADD COLUMN x INT64',
    'TRUNCATE TABLE t', "EXPORT DATA OPTIONS(uri='gs://bucket/*', format='CSV') AS SELECT 1",
    "LOAD DATA INTO t FROM FILES(format='CSV', uris=['gs://bucket/*'])",
    'CALL p()', "EXECUTE IMMEDIATE 'SELECT 1'", 'BEGIN SELECT 1; END',
    'IF TRUE THEN SELECT 1; END IF', 'FOR x IN (SELECT 1) DO SELECT x; END FOR',
    'SET @@dataset_id = "other"', 'SET (@@dataset_id, x) = ("other", 1)',
    'SELECT 1 |> INSERT INTO t'
  ]) assert.throws(() => assertReadOnlyBigQueryScript(`DECLARE x INT64; ${statement}; SELECT x;`), /read-only/, statement)
  for (const sql of ['', '-- comment only', 'DECLARE x INT64;', 'SELECT 1; SET x = 2;']) {
    assert.throws(() => assertReadOnlyBigQueryScript(sql), /ending with a SELECT/)
  }
})

test('cannot hide a subsequent write behind comments, quotes, or raw literals', () => {
  for (const sql of [
    "SELECT 'a;'; /* SELECT */ DELETE FROM t; SELECT 1;",
    'SELECT """a;\nb"""; DROP TABLE t; SELECT 1;',
    String.raw`SELECT r'\\'; DELETE FROM t; SELECT 1;`,
    'SELECT `a;b`; -- comment\rINSERT INTO t VALUES (1); SELECT 1;',
    'SELECT 1; /* comment */ EXECUTE IMMEDIATE "SELECT 1"; SELECT 1;'
  ]) assert.throws(() => assertReadOnlyBigQueryScript(sql), /read-only/, sql)
})

test('fails closed on unterminated comments and quoted values', () => {
  for (const sql of ["SELECT 'unterminated", 'SELECT """unterminated', 'SELECT `unterminated', 'SELECT 1; /* unterminated']) {
    assert.throws(() => assertReadOnlyBigQueryScript(sql), /Unterminated/)
  }
})
