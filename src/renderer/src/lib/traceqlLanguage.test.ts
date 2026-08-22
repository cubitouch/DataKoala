import assert from 'node:assert/strict'
import test from 'node:test'
import { highlightTree, classHighlighter } from '@lezer/highlight'
import { traceqlLanguage } from './traceqlLanguage.ts'

test('TraceQL language provides syntax-tree highlighting', () => {
  const query = '{ resource.service.name = "checkout" && duration > 300ms } | by(resource.service.name) // service query'
  const ranges: Array<{ text: string; classes: string }> = []
  highlightTree(traceqlLanguage.parser.parse(query), classHighlighter, (from, to, classes) => ranges.push({ text: query.slice(from, to), classes }))
  for (const text of ['resource', '"checkout"', 'duration', '300ms', '=', '&&', 'by(', '// service query']) {
    assert.ok(ranges.some((range) => range.text.includes(text)), `expected highlighted range for ${text}: ${JSON.stringify(ranges)}`)
  }
  assert.ok(new Set(ranges.map((range) => range.classes)).size >= 4)
})

test('TraceQL language exposes comment and close-bracket ergonomics', () => {
  const data = traceqlLanguage.data.of({})
  assert.ok(data)
  assert.equal(traceqlLanguage.parser.parse('{ true } // comment').type.name, 'TraceQL')
})
