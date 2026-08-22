import { parser } from '@grafana/lezer-traceql'
import type { Tree } from '@lezer/common'

export type FormatTraceqlResult = { ok: true; query: string } | { ok: false; error: string }

interface Token { name: string; text: string; from?: number; to?: number }

export function traceqlHasErrors(tree: Tree): boolean {
  const cursor = tree.cursor()
  do {
    if (cursor.type.isError) return true
  } while (cursor.next())
  return false
}

function tokens(query: string, tree: Tree): Token[] {
  const result: Token[] = []
  const cursor = tree.cursor()
  const visit = () => {
    if (!cursor.firstChild()) {
      result.push({ name: cursor.name, text: query.slice(cursor.from, cursor.to), from: cursor.from, to: cursor.to })
      return
    }
    do visit(); while (cursor.nextSibling())
    cursor.parent()
  }
  visit()
  const withDelimiters: Token[] = []
  let position = 0
  const addGap = (gap: string) => {
    for (const match of gap.matchAll(/[^\s{}(),.]+|[{}(),.]/g)) withDelimiters.push({ name: 'Literal', text: match[0] })
  }
  for (const token of result.filter((item) => item.text.length > 0)) {
    addGap(query.slice(position, token.from))
    withDelimiters.push(token)
    position = token.to ?? position
  }
  addGap(query.slice(position))
  return withDelimiters
}

const operators = new Set(['And', 'Or', 'FieldOp', 'ScalarOp', 'ComparisonOp', 'Pipe', 'Desc', 'Anc', 'Gt', 'Lt', 'ExperimentalOp', 'UnionStructuralOp'])

function trimHorizontalEnd(value: string): string {
  return value.replace(/[\t ]+$/, '')
}

function compact(source: Token[]): string {
  let output = ''
  let previous: Token | undefined
  for (const token of source) {
    if (token.name === 'LineComment') {
      output = trimHorizontalEnd(output) + (output ? ' ' : '') + token.text.trimEnd() + '\n'
      previous = undefined
      continue
    }
    if (token.name === 'BlockComment') {
      output = trimHorizontalEnd(output) + (output ? ' ' : '') + token.text + ' '
      previous = token
      continue
    }
    const text = token.text
    if (text === '}') output = trimHorizontalEnd(output) + (output.endsWith('{') ? '' : ' ') + '}'
    else if (text === '{') output += (output && !output.endsWith(' ') && previous?.text !== '(' ? ' ' : '') + '{ '
    else if (text === ',') output = trimHorizontalEnd(output) + ', '
    else if (text === ')') output = trimHorizontalEnd(output) + ')'
    else if (text === '(') output = trimHorizontalEnd(output) + '('
    else if (text === '.') output = trimHorizontalEnd(output) + '.'
    else if (operators.has(token.name)) output = trimHorizontalEnd(output) + ` ${text} `
    else {
      const needsSpace = output.length > 0 && !/[\s({.]$/.test(output) && previous?.text !== ','
      output += (needsSpace ? ' ' : '') + text
    }
    previous = token
  }
  return output.trim()
}

function expanded(query: string): string {
  const source = tokens(query, parser.parse(query))
  let indent = 0
  let output = ''
  const line = () => {
    output = trimHorizontalEnd(output)
    if (!output.endsWith('\n')) output += '\n'
    output += '  '.repeat(indent)
  }
  for (let index = 0; index < source.length; index++) {
    const token = source[index]
    if (token.text === '{') { output += (output && !output.endsWith('\n') ? ' ' : '') + '{'; indent++; line(); continue }
    if (token.text === '}') { indent--; line(); output += '}'; continue }
    if (token.name === 'LineComment') { output += (output.endsWith(' ') ? '' : ' ') + token.text.trimEnd(); line(); continue }
    if (token.name === 'BlockComment') { output += (output.endsWith(' ') ? '' : ' ') + token.text; line(); continue }
    if (token.name === 'And' || token.name === 'Or') { output = trimHorizontalEnd(output) + `${output.endsWith('\n') ? '' : ' '}${token.text}`; line(); continue }
    if (token.name === 'Pipe' || ['Desc', 'Anc', 'Gt', 'Lt', 'ExperimentalOp', 'UnionStructuralOp'].includes(token.name)) {
      line(); output += token.text; line(); continue
    }
    const fragment = compact([token])
    const previous = source[index - 1]
    if (operators.has(token.name)) output = trimHorizontalEnd(output) + `${output.endsWith('\n') ? '' : ' '}${fragment} `
    else if (token.text === ',') output = trimHorizontalEnd(output) + ', '
    else if (token.text === ')') output = trimHorizontalEnd(output) + ')'
    else if (token.text === '(') output = trimHorizontalEnd(output) + '('
    else if (token.text === '.') output = trimHorizontalEnd(output) + '.'
    else output += output && !/[\s({.]$/.test(output) && previous?.text !== ',' ? ` ${fragment}` : fragment
  }
  return output.split('\n').map((value) => value.trimEnd()).join('\n').trim()
}

/** Formats only parser-recognized tokens; token contents are always copied verbatim. */
export function formatTraceql(query: string): FormatTraceqlResult {
  const tree = parser.parse(query)
  if (traceqlHasErrors(tree)) return { ok: false, error: 'Could not format TraceQL: the query contains invalid syntax.' }
  const source = tokens(query, tree)
  const oneLine = compact(source)
  const formatted = query.includes('\n') || oneLine.length > 100 ? expanded(query) : oneLine
  const formattedTree = parser.parse(formatted)
  if (traceqlHasErrors(formattedTree) || formattedTree.toString() !== tree.toString()) return { ok: false, error: 'Could not format TraceQL without changing its syntax.' }
  return { ok: true, query: formatted }
}
