import { describe, expect, it } from 'vitest'
import {
  addToRecentlyViewed,
  normalizeRecentlyViewed,
  RECENTLY_VIEWED_LIMIT,
  type RecentlyViewedProduct,
} from './recently-viewed'

const product = (id: string, viewedAt = 0): RecentlyViewedProduct => ({
  id,
  slug: `piece-${id}`,
  name: `Pièce ${id}`,
  priceDzd: 1500,
  imageUrl: 'https://example.com/piece.jpg',
  viewedAt,
})

describe('recently viewed products', () => {
  it('rejects malformed entries and unsafe image URLs', () => {
    const list = normalizeRecentlyViewed([
      null,
      { id: 'a' },
      { id: 'b', slug: 'b', name: 'B', priceDzd: -1 },
      { id: 'c', slug: 'c', name: 'C', priceDzd: 900, imageUrl: 'javascript:alert(1)' },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'c', priceDzd: 900, imageUrl: null })
  })

  it('keeps the most recent entry first and removes duplicates', () => {
    const existing = [product('old'), product('shared')]
    const next = addToRecentlyViewed(existing, {
      id: 'shared',
      slug: 'piece-shared',
      name: 'Pièce partagée',
      priceDzd: 2000,
      imageUrl: null,
    })
    expect(next.map((item) => item.id)).toEqual(['shared', 'old'])
    expect(next[0].priceDzd).toBe(2000)
  })

  it('caps the stored history', () => {
    let list: RecentlyViewedProduct[] = []
    for (let index = 0; index < RECENTLY_VIEWED_LIMIT + 4; index += 1) {
      list = addToRecentlyViewed(list, {
        id: `p${index}`,
        slug: `p${index}`,
        name: `Produit ${index}`,
        priceDzd: 1000,
        imageUrl: null,
      })
    }
    expect(list).toHaveLength(RECENTLY_VIEWED_LIMIT)
    expect(list[0].id).toBe(`p${RECENTLY_VIEWED_LIMIT + 3}`)
  })

  it('returns an empty list for non-array storage', () => {
    expect(normalizeRecentlyViewed('oops')).toEqual([])
    expect(normalizeRecentlyViewed({})).toEqual([])
  })
})
