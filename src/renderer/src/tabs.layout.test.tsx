import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

const tabsCss = readFileSync('src/renderer/src/tabs.css', 'utf8')

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tabsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))
  expect(match, `Expected a CSS rule for ${selector}`).toBeTruthy()
  return match![1]
}

test('the titlebar tab strip sizes to its contents instead of consuming drag space', () => {
  const titlebarTabs = rule('.titlebar > .query-tabs')
  expect(titlebarTabs).toMatch(/flex:\s*0\s+1\s+auto\s*;/)
  expect(titlebarTabs).toMatch(/width:\s*max-content\s*;/)
  expect(titlebarTabs).toMatch(/min-width:\s*0\s*;/)
  expect(titlebarTabs).toMatch(/-webkit-app-region:\s*no-drag\s*;/)

  const dragSpace = rule('.titlebar-drag-space')
  expect(dragSpace).toMatch(/flex:\s*1\s+1\s+28px\s*;/)
  expect(dragSpace).toMatch(/min-width:\s*28px\s*;/)
})

test('tab and add controls remain outside the draggable app region', () => {
  expect(rule('.query-tab')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
  expect(rule('.query-tab-main')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
  expect(rule('.query-tab-close,\n.query-tab-add')).toMatch(/-webkit-app-region:\s*no-drag\s*;/)
})
