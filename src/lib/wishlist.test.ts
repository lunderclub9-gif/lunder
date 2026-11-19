import { describe, expect, it } from 'vitest'
import {
  addToWishlist,
  normalizeWishlist,
  removeFromWishlist,
  WISHLIST_LIMIT,
  type WishlistItem,
} from './wishlist-core'

const product = (id: string) => ({
  id,
  slug: `piece-${id}`,
  name: `Pièce ${id}`,
  priceDzd: 1200,
  imageUrl: 'https://example.com/piece.jpg',
})

describe('wishlist storage', () => {
  it('drops malformed entries and unsafe image URLs', () => {
    const list = normalizeWishlist([
      null,
      { id: 'a' },
      { id: 'b', slug: 'b', name: 'B', priceDzd: Number.NaN },
      { id: 'c', slug: 'c', name: 'C', priceDzd: 800, imageUrl: 'data:image/svg+xml;base64,AA' },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'c', imageUrl: null })
  })

  it('does not duplicate a product already saved', () => {
    const first = addToWishlist([], product('one'))
    const second = addToWishlist(first, product('one'))
    expect(second).toHaveLength(1)
  })

  it('removes by product id', () => {
    const list = removeFromWishlist(addToWishlist([], product('two')), 'two')
    expect(list).toEqual([])
  })

  it('caps the saved list, keeping the most recent additions', () => {
    let list: WishlistItem[] = []
    for (let index = 0; index < WISHLIST_LIMIT + 3; index += 1) {
      list = addToWishlist(list, product(`p${index}`))
    }
    expect(list).toHaveLength(WISHLIST_LIMIT)
    expect(list[0].id).toBe(`p${WISHLIST_LIMIT + 2}`)
  })
})
