import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

const tabsCss = readFileSync('src/renderer/src/components/QueryTabs.module.css', 'utf8')
const appCss = readFileSync('src/renderer/src/App.module.css', 'utf8')
const utilityCss = readFileSync('src/renderer/src/components/QueryUtilityActions.module.css', 'utf8')
const shellCss = readFileSync('src/renderer/src/styles.css', 'utf8')

function rule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))
  expect(match, `Expected a CSS rule for ${selector}`).toBeTruthy()
  return match![1]
}

test('the titlebar owns tab-strip placement and leaves unused space draggable', () => {
  const titlebarTabs = rule(appCss, '.queryTabs')
  expect(titlebarTabs).toMatch(/flex:\s*0\s+1\s+auto\s*;/)
  expect(titlebarTabs).not.toMatch(/flex:\s*1\s+1\s+auto\s*;/)
  expect(titlebarTabs).toMatch(/min-width:\s*0\s*;/)
  expect(titlebarTabs).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
  expect(titlebarTabs).toMatch(/scrollbar-width:\s*none\s*;/)
  const componentRoot = rule(tabsCss, '.root')
  expect(componentRoot).toMatch(/overflow-x:\s*auto\s*;/)
  expect(componentRoot).not.toMatch(/(?:^|;)\s*flex(?:-grow|-shrink|-basis)?\s*:/)
  expect(rule(appCss, '.queryTabs::-webkit-scrollbar')).toMatch(/display:\s*none\s*;/)
  expect(rule(appCss, '.dragSpace')).toMatch(/flex:\s*1\s+1\s+28px\s*;/)
  expect(rule(appCss, '.dragSpace')).toMatch(/min-width:\s*28px\s*;/)
})

test('tab and add controls remain outside the draggable app region', () => {
  expect(rule(tabsCss, '.tab')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
  expect(rule(tabsCss, '.main')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
  expect(rule(tabsCss, '.close, .add')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
})

test('query utility actions retain their compact narrow-toolbar sizing', () => {
  const utilities = rule(utilityCss, '.root :global(.btn)')
  expect(utilities).toMatch(/padding-inline:\s*6px\s*;/)
  expect(utilities).toMatch(/font-size:\s*10px\s*;/)
})

test('the application shell is constrained to the root without becoming a document scroller', () => {
  const root = rule(shellCss, 'html, body, #root')
  expect(root).toMatch(/width:\s*100%\s*;/)
  expect(root).toMatch(/height:\s*100%\s*;/)
  expect(root).toMatch(/overflow:\s*hidden\s*;/)
  const app = rule(appCss, '.app')
  expect(app).toMatch(/height:\s*100%\s*;/)
  expect(app).toMatch(/min-height:\s*0\s*;/)
  expect(app).toMatch(/overflow:\s*hidden\s*;/)
})
