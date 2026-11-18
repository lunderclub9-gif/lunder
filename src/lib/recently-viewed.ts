/**
 * « Récemment consultés » — un aperçu local, sans compte ni requête réseau.
 * Les données restent dans le navigateur du visiteur et sont validées à la
 * lecture : un stockage altéré ne peut pas injecter d'URL arbitraire dans une
 * balise image.
 */

export type RecentlyViewedProduct = {
  id: string
  slug: string
  name: string
  priceDzd: number
  imageUrl: string | null
  viewedAt: number
}

export const RECENTLY_VIEWED_KEY = 'lunders_recemment_vus_v1'
export const RECENTLY_VIEWED_LIMIT = 8

function safeImageUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null
}

export function normalizeRecentlyViewed(value: unknown, limit = RECENTLY_VIEWED_LIMIT): RecentlyViewedProduct[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const items: RecentlyViewedProduct[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Partial<RecentlyViewedProduct>
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
      viewedAt: typeof item.viewedAt === 'number' && Number.isFinite(item.viewedAt) ? item.viewedAt : 0,
    })
    if (items.length >= limit) break
  }

  return items
}

export function addToRecentlyViewed(
  list: RecentlyViewedProduct[],
  product: Omit<RecentlyViewedProduct, 'viewedAt'>,
  limit = RECENTLY_VIEWED_LIMIT
): RecentlyViewedProduct[] {
  const entry: RecentlyViewedProduct = { ...product, viewedAt: Date.now() }
  return normalizeRecentlyViewed(
    [entry, ...list.filter((item) => item.id !== product.id)],
    limit
  )
}

export function readRecentlyViewed(limit = RECENTLY_VIEWED_LIMIT): RecentlyViewedProduct[] {
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY)
    if (!raw) return []
    return normalizeRecentlyViewed(JSON.parse(raw) as unknown, limit)
  } catch {
    return []
  }
}

export function recordRecentlyViewed(product: Omit<RecentlyViewedProduct, 'viewedAt'>): void {
  try {
    const next = addToRecentlyViewed(readRecentlyViewed(), product)
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next))
  } catch {
    /* stockage indisponible (navigation privée) : l'aperçu reste simplement vide */
  }
}
