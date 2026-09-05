import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const components = resolve(process.cwd(), 'src/renderer/src/components')

describe('editable query architecture', () => {
  for (const file of ['QueryEditor.tsx', 'LokiExplorer.tsx', 'TraceExplorer.tsx']) {
    it(`${file} uses the shared editable query primitives`, () => {
      const source = readFileSync(resolve(components, file), 'utf8')
      expect(source).toMatch(/<QueryToolbar\b/)
      expect(source).toMatch(/<QueryCodeEditor\b/)
      expect(source).not.toMatch(/from ['"]@uiw\/react-codemirror['"]|<CodeMirror\b/)
    })
  }
})
