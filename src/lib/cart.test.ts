import { describe, expect, it } from 'vitest'
import { normalizeStoredCart } from './cart'

describe('normalizeStoredCart', () => {
  it('keeps valid items and rebuilds their stable keys', () => {
    const items = normalizeStoredCart([{
      key: 'tampered',
      productId: 'product-1',
      variantId: 'variant-2',
      slug: 'desk-organizer',
      name: 'Desk organizer',
      variantLabel: 'Black',
      unitPriceDzd: 1200,
      quantity: 2,
      imageUrl: 'https://cdn.example.test/product.webp',
    }])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      key: 'product-1::variant-2',
      quantity: 2,
      unitPriceDzd: 1200,
      imageUrl: 'https://cdn.example.test/product.webp',
    })
  })

  it('drops malformed items and clamps quantities to the cart limit', () => {
    const items = normalizeStoredCart([
      null,
      { productId: 'missing-fields' },
      {
        productId: 'product-1',
        variantId: null,
        slug: 'lamp',
        name: 'Lamp',
        quantity: 99,
        unitPriceDzd: 800,
        imageUrl: 'javascript:alert(1)',
      },
      {
        productId: 'product-2',
        slug: 'bad-price',
        name: 'Bad price',
        quantity: 1,
        unitPriceDzd: Number.NaN,
      },
    ])

    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(10)
    expect(items[0].imageUrl).toBeNull()
    expect(items[0].key).toBe('product-1::base')
  })

  it('rejects non-array storage values', () => {
    expect(normalizeStoredCart({ items: [] })).toEqual([])
    expect(normalizeStoredCart(null)).toEqual([])
  })
})
