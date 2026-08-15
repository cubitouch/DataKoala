import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

const tabsCss = readFileSync('src/renderer/src/tabs.css', 'utf8')
const shellCss = readFileSync('src/renderer/src/styles.css', 'utf8')

function rule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))
  expect(match, `Expected a CSS rule for ${selector}`).toBeTruthy()
  return match![1]
}

test('the titlebar tab strip sizes to its contents instead of consuming drag space', () => {
  const titlebarTabs = rule(tabsCss, '.titlebar > .query-tabs')
  expect(titlebarTabs).toMatch(/flex:\s*0\s+1\s+auto\s*;/)
  expect(titlebarTabs).not.toMatch(/flex:\s*1\s+1\s+auto\s*;/)
  expect(titlebarTabs).not.toMatch(/(?:^|\n)\s*width\s*:/)
  expect(titlebarTabs).toMatch(/min-width:\s*0\s*;/)
  expect(titlebarTabs).toMatch(/-webkit-app-region:\s*no-drag\s*;/)

  const dragSpace = rule(tabsCss, '.titlebar-drag-space')
  expect(dragSpace).toMatch(/flex:\s*1\s+1\s+28px\s*;/)
  expect(dragSpace).toMatch(/min-width:\s*28px\s*;/)
})

test('tab and add controls remain outside the draggable app region', () => {
  expect(rule(tabsCss, '.query-tab')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
  expect(rule(tabsCss, '.query-tab-main')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
  expect(rule(tabsCss, '.query-tab-close,\n.query-tab-add')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
})

test('the application shell is constrained to the root without becoming a document scroller', () => {
  const root = rule(shellCss, 'html, body, #root')
  expect(root).toMatch(/width:\s*100%\s*;/)
  expect(root).toMatch(/height:\s*100%\s*;/)
  expect(root).toMatch(/overflow:\s*hidden\s*;/)

  const app = rule(shellCss, '.app')
  expect(app).toMatch(/height:\s*100%\s*;/)
  expect(app).toMatch(/min-height:\s*0\s*;/)
  expect(app).toMatch(/overflow:\s*hidden\s*;/)
  expect(app).not.toMatch(/100vh/)
})
