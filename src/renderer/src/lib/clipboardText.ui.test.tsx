// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboardText'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('copyTextToClipboard', () => {
  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await copyTextToClipboard('select 1;')

    expect(writeText).toHaveBeenCalledWith('select 1;')
  })

  it('falls back to a temporary textarea when Clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    })

    await copyTextToClipboard('select 2;')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })
})

it.each([false, true])(
  'restores focus and selected text after fallback copy success=%s',
  async (ok) => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => ok),
    })
    const button = document.createElement('button')
    const text = document.createElement('p')
    text.textContent = 'selected draft'
    document.body.append(button, text)
    button.focus()
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    try {
      if (ok) await copyTextToClipboard('copy')
      else
        await expect(copyTextToClipboard('copy')).rejects.toThrow(
          'Copy command failed',
        )
      expect(document.activeElement).toBe(button)
      expect(window.getSelection()!.toString()).toBe('selected draft')
      expect(document.querySelector('textarea')).toBeNull()
    } finally {
      button.remove()
      text.remove()
    }
  },
)
