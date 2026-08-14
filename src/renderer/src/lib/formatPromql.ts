import { deparse, parse } from 'promql-ast'

export type PromqlFormatResult = { ok: true; query: string } | { ok: false; error: string }

/** Parse and render PromQL through an AST so formatting can never be a text rewrite. */
export function formatPromql(query: string): PromqlFormatResult {
  try {
    return { ok: true, query: deparse(parse(query)) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not format PromQL' }
  }
}
