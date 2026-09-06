import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Tempo query toolbar responsiveness', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/components/TraceExplorer.module.css'), 'utf8')

  it('applies narrow flex and ordering to the shared toolbar group rather than its options content', () => {
    expect(css).toMatch(/@container\s*\(max-width:\s*760px\)[\s\S]*\.queryToolbar\s+:global\(\.query-time-group\)\s*\{[\s\S]*?flex:\s*1 0 100%;[\s\S]*?order:\s*2;/)
    const optionsRule = css.match(/\.queryOptions\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(optionsRule).not.toMatch(/\b(?:flex|order)\s*:/)
  })

  it('uses the query panel as the responsive container and lets the shared toolbar wrap', () => {
    expect(css).toMatch(/\.searchForm\s*\{[^}]*container-type:\s*inline-size;/s)
    expect(css.match(/\.queryToolbar\s*\{([^}]*)\}/)?.[1]).not.toMatch(/flex-wrap:\s*nowrap/)
    expect(css).toMatch(/\.queryToolbar\s+:global\(\.query-editor-actions\)[\s\S]*flex-shrink:\s*0;/)
    expect(css).toMatch(/\.queryToolbar\s+:global\(\.execution-group\)[\s\S]*flex-shrink:\s*0;/)
  })
})
