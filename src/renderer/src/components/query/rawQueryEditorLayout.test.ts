import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const components = resolve(process.cwd(), 'src/renderer/src/components')

const lokiEditor = /\.editor\s*\{([^}]*)\}/
const lokiCodeMirror = /\.editor\s+:global\(\.cm-editor\)\s*\{([^}]*)\}/
const tempoDiscovery = /\.discoveryPanel\s*\{([^}]*)\}/
const tempoRawForm = /\.searchForm:has\(\.traceqlField\)\s*\{([^}]*)\}/
const tempoField = /\.traceqlField\s*\{([^}]*)\}/
const tempoTheme = /\.traceqlField\s+:global\(\.cm-theme\)\s*\{([^}]*)\}/

function readCss(path: string) {
  return readFileSync(resolve(components, path), 'utf8')
}

function ruleBody(css: string, pattern: RegExp) {
  return css.match(pattern)?.[1] ?? ''
}

describe('raw query editor layout', () => {
  it('keeps the Loki editor edge-to-edge inside the resizable query panel', () => {
    const css = readCss('workspaces/loki/LokiExplorer.module.css')
    const editorRule = ruleBody(css, lokiEditor)
    const codeMirrorRule = ruleBody(css, lokiCodeMirror)

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
    const discoveryRule = ruleBody(css, tempoDiscovery)
    const rawFormRule = ruleBody(css, tempoRawForm)
    const fieldRule = ruleBody(css, tempoField)
    const themeRule = ruleBody(css, tempoTheme)

    expect(discoveryRule).toMatch(/display:\s*flex/)
    expect(discoveryRule).toMatch(/flex-direction:\s*column/)
    expect(rawFormRule).toMatch(/flex:\s*1/)
    expect(rawFormRule).toMatch(/min-height:\s*0/)
    expect(fieldRule).toMatch(/flex:\s*1/)
    expect(fieldRule).toMatch(/padding:\s*0/)
    expect(themeRule).toMatch(/height:\s*100%/)
  })
})
