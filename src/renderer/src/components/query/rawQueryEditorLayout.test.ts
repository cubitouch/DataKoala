import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const renderer = resolve(process.cwd(), 'src/renderer/src')

function readRendererFile(path: string) {
  return readFileSync(resolve(renderer, path), 'utf8')
}

describe('shared query editor layout', () => {
  it('keeps the SQL and PromQL editor layout in QueryCodeEditor', () => {
    const css = readRendererFile(
      'components/query/QueryCodeEditor.module.css',
    )

    expect(css).toMatch(/\.editor\s*\{[^}]*flex:\s*1/s)
    expect(css).toMatch(/\.editor\s*\{[^}]*min-height:\s*0/s)
    expect(css).toMatch(/\.editor\s*\{[^}]*overflow:\s*auto/s)
    expect(css).toMatch(
      /\.editor\s+:global\(\.cm-editor\)\s*\{[^}]*height:\s*100%/s,
    )
    expect(css).toMatch(
      /\.editor\s+:global\(\.cm-scroller\)\s*\{[^}]*font-family:\s*var\(--mono\)/s,
    )
  })

  it('does not restyle CodeMirror from Loki or Tempo', () => {
    const loki = readRendererFile(
      'components/workspaces/loki/LokiExplorer.module.css',
    )
    const tempo = readRendererFile(
      'components/workspaces/tempo/TraceExplorer.module.css',
    )
    const globals = readRendererFile('styles.css')

    expect(loki).not.toMatch(/:global\(\.cm-/)
    expect(tempo).not.toMatch(/:global\(\.cm-/)
    expect(globals).not.toMatch(/TraceQL editor/)
  })

  it('keeps only raw-workspace container sizing locally', () => {
    const loki = readRendererFile(
      'components/workspaces/loki/LokiExplorer.module.css',
    )
    const tempo = readRendererFile(
      'components/workspaces/tempo/TraceExplorer.module.css',
    )

    expect(loki).toMatch(
      /\.rawQueryBody\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s,
    )
    expect(tempo).toMatch(
      /\.rawSearchForm\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s,
    )
  })
})
