import { describe, expect, it } from 'vitest'
import { createTextSearch } from './textSearch'

describe('loaded log text search', () => {
  it('finds every literal case-insensitive occurrence inside longer strings', () => {
    const search = createTextSearch('a word')
    const text = 'prefixA WORDsuffix a word'
    expect(search.matches(text)).toBe(true)
    expect(search.segments(text)).toEqual([
      { text: 'prefix', matched: false }, { text: 'A WORD', matched: true },
      { text: 'suffix ', matched: false }, { text: 'a word', matched: true }
    ])
  })
  it('treats regex characters and whitespace literally', () => {
    expect(createTextSearch('.*').segments('a.*b.*').filter((part) => part.matched).map((part) => part.text)).toEqual(['.*', '.*'])
    expect(createTextSearch(' word ').matches('word')).toBe(false)
  })
  it('returns unchanged text when cleared or unmatched', () => {
    for (const term of ['', 'missing']) expect(createTextSearch(term).segments('original')).toEqual([{ text: 'original', matched: false }])
  })
  it('preserves original Unicode text and offsets after lowercase expansion', () => {
    for (const term of ['i', 'word', '\u0307']) {
      const parts = createTextSearch(term).segments('İ WORD 😀')
      expect(parts.map((part) => part.text).join('')).toBe('İ WORD 😀')
      expect(parts.some((part) => part.matched)).toBe(true)
    }
  })
})
