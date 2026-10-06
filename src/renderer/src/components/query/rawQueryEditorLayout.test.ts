import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const renderer = resolve(process.cwd(), 'src/renderer/src')

function readRendererFile(path: string) {
  return readFileSync(resolve(renderer, path), 'utf8')
}

describe('shared query editor layout', () => {
  it('keeps the canonical layout in QueryCodeEditor', () => {
    const css = readRendererFile('components/query/QueryCodeEditor.module.css')

    expect(css).toContain(`.editor {
  flex: 1;
  min-width: 0;
  min-height: 0;
  border: 0;
  overflow: auto;
}`)
    expect(css).toContain(`.editor :global(.cm-editor) {
  height: 100%;
}`)
    expect(css).toContain(`.editor :global(.cm-scroller) {
  font-family: var(--mono);
}`)
  })

  it('does not restyle CodeMirror from Loki or Tempo', () => {
    const loki = readRendererFile(
      'components/workspaces/loki/LokiExplorer.module.css',
    )
    const tempo = readRendererFile(
      'components/workspaces/tempo/TraceExplorer.module.css',
    )
    const globals = readRendererFile('styles.css')

    expect(loki).not.toContain(':global(.cm-')
    expect(tempo).not.toContain(':global(.cm-')
    expect(globals).not.toContain('TraceQL editor')
  })

  it('keeps only raw-workspace container sizing locally', () => {
    const loki = readRendererFile(
      'components/workspaces/loki/LokiExplorer.module.css',
    )
    const tempo = readRendererFile(
      'components/workspaces/tempo/TraceExplorer.module.css',
    )

    expect(loki).toContain(`.rawQueryBody {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}`)
    expect(tempo).toContain(`.rawSearchForm {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}`)
  })
})
