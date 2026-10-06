import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const components = resolve(process.cwd(), 'src/renderer/src/components')

const readCss = (path: string) =>
  readFileSync(resolve(components, path), 'utf8')

describe('raw query editor layout', () => {
  it('keeps the Loki editor edge-to-edge inside the resizable query panel', () => {
    const css = readCss('workspaces/loki/LokiExplorer.module.css')
    const editorRule = css.match(/\.editor\s*\{([^}]*)\}/)?.[1] ?? ''
    const codeMirrorRule =
      css.match(/\.editor\s+:global\(\.cm-editor\)\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(editorRule).toMatch(/width:\s*100%/)
    expect(editorRule).toMatch(/height:\s*100%/)
    expect(editorRule).toMatch(/padding:\s*0/)
    expect(codeMirrorRule).toMatch(/width:\s*100%/)
    expect(codeMirrorRule).toMatch(/height:\s*100%/)
    expect(codeMirrorRule).toMatch(/border:\s*0/)
    expect(codeMirrorRule).toMatch(/border-radius:\s*0/)
  })

  it('lets the Tempo raw editor consume the remaining discovery-panel height', () => {
    const css = readCss('workspaces/tempo/TraceExplorer.module.css')
    const discoveryRule =
      css.match(/\.discoveryPanel\s*\{([^}]*)\}/)?.[1] ?? ''
    const rawFormRule =
      css.match(/\.searchForm:has\(\.traceqlField\)\s*\{([^}]*)\}/)?.[1] ?? ''
    const fieldRule = css.match(/\.traceqlField\s*\{([^}]*)\}/)?.[1] ?? ''
    const themeRule =
      css.match(
        /\.traceqlField\s+:global\(\.cm-theme\)\s*\{([^}]*)\}/,
      )?.[1] ?? ''

    expect(discoveryRule).toMatch(/display:\s*flex/)
    expect(discoveryRule).toMatch(/flex-direction:\s*column/)
    expect(rawFormRule).toMatch(/flex:\s*1/)
    expect(rawFormRule).toMatch(/min-height:\s*0/)
    expect(fieldRule).toMatch(/flex:\s*1/)
    expect(fieldRule).toMatch(/padding:\s*0/)
    expect(themeRule).toMatch(/height:\s*100%/)
  })
})
