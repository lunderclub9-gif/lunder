import { describe, expect, it } from 'vitest'
import { addRecentSearch, normalizeRecentSearches, RECENT_SEARCHES_LIMIT } from './recent-searches'

describe('recent searches', () => {
  it('ignores non-strings, blanks and very short terms', () => {
    expect(normalizeRecentSearches([null, 3, '', ' a ', 'support mural'])).toEqual(['support mural'])
  })

  it('deduplicates case-insensitively and keeps the newest spelling', () => {
    expect(addRecentSearch(['Support mural', 'PLA'], 'support mural')).toEqual(['support mural', 'PLA'])
  })

  it('keeps only the most recent terms', () => {
    const list = Array.from({ length: 10 }, (_, index) => `terme ${index}`)
    const result = normalizeRecentSearches(list)
    expect(result).toHaveLength(RECENT_SEARCHES_LIMIT)
    expect(result[0]).toBe('terme 0')
  })

  it('handles invalid storage shapes', () => {
    expect(normalizeRecentSearches('oops')).toEqual([])
    expect(normalizeRecentSearches({ term: 'x' })).toEqual([])
  })
})
