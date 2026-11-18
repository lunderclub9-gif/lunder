/** Logique pure des favoris : validée, testable et sans dépendance React. */

export type WishlistItem = {
  id: string
  slug: string
  name: string
  priceDzd: number
  imageUrl: string | null
  addedAt: number
}

export const WISHLIST_KEY = 'lunders_favoris_v1'
export const WISHLIST_LIMIT = 60

function safeImageUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null
}

/**
 * Valide le contenu du stockage local : une entrée altérée ne doit jamais
 * pouvoir injecter une URL d'image arbitraire ni un prix non numérique.
 */
export function normalizeWishlist(value: unknown, limit = WISHLIST_LIMIT): WishlistItem[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const items: WishlistItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Partial<WishlistItem>
    if (
      typeof item.id !== 'string' || !item.id ||
      typeof item.slug !== 'string' || !item.slug ||
      typeof item.name !== 'string' || !item.name ||
      typeof item.priceDzd !== 'number' || !Number.isFinite(item.priceDzd) || item.priceDzd < 0
    ) continue
    if (seen.has(item.id)) continue
    seen.add(item.id)
    items.push({
      id: item.id,
      slug: item.slug.slice(0, 200),
      name: item.name.slice(0, 200),
      priceDzd: item.priceDzd,
      imageUrl: safeImageUrl(item.imageUrl),
      addedAt: typeof item.addedAt === 'number' && Number.isFinite(item.addedAt) ? item.addedAt : 0,
    })
    if (items.length >= limit) break
  }
  return items
}

export function addToWishlist(
  list: WishlistItem[],
  product: Omit<WishlistItem, 'addedAt'>,
  limit = WISHLIST_LIMIT
): WishlistItem[] {
  if (list.some((item) => item.id === product.id)) return list
  return normalizeWishlist([{ ...product, addedAt: Date.now() }, ...list], limit)
}

export function removeFromWishlist(list: WishlistItem[], productId: string): WishlistItem[] {
  return list.filter((item) => item.id !== productId)
}
