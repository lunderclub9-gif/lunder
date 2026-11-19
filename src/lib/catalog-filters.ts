/** Filtres catalogue partagés entre l'URL, l'interface et la requête Supabase. */

export type PriceBucketId = 'all' | 'under-2000' | '2000-5000' | '5000-10000' | 'over-10000'

export type PriceBucket = {
  id: PriceBucketId
  label: string
  min?: number
  max?: number
}

export const PRICE_BUCKETS: PriceBucket[] = [
  { id: 'all', label: 'Tous les prix' },
  { id: 'under-2000', label: 'Moins de 2 000 DA', max: 2000 },
  { id: '2000-5000', label: '2 000 – 5 000 DA', min: 2000, max: 5000 },
  { id: '5000-10000', label: '5 000 – 10 000 DA', min: 5000, max: 10000 },
  { id: 'over-10000', label: 'Plus de 10 000 DA', min: 10000 },
]

export function parsePriceBucket(value: string | null | undefined): PriceBucketId {
  const match = PRICE_BUCKETS.find((bucket) => bucket.id === value)
  return match ? match.id : 'all'
}

export function priceBucketRange(value: string | null | undefined): { min?: number; max?: number } {
  const bucket = PRICE_BUCKETS.find((item) => item.id === parsePriceBucket(value))
  if (!bucket) return {}
  return {
    ...(bucket.min != null ? { min: bucket.min } : {}),
    ...(bucket.max != null ? { max: bucket.max } : {}),
  }
}

export function priceBucketLabel(value: string | null | undefined): string {
  const bucket = PRICE_BUCKETS.find((item) => item.id === parsePriceBucket(value))
  return bucket?.label ?? PRICE_BUCKETS[0].label
}

/**
 * Retrouve la matière canonique enregistrée à partir de la valeur d'URL.
 * Les matières venant de la base peuvent varier en casse ; la comparaison est
 * insensible à la casse et la valeur envoyée à Supabase est toujours celle de
 * la base, jamais la saisie brute de l'URL.
 */
export function resolveMaterial(value: string | null | undefined, materials: string[]): string {
  if (!value) return ''
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  return materials.find((material) => material.toLowerCase() === normalized) ?? ''
}

export function collectMaterials(values: (string | null | undefined)[]): string[] {
  const unique = new Map<string, string>()
  values.forEach((value) => {
    const material = value?.trim()
    if (!material) return
    const key = material.toLowerCase()
    if (!unique.has(key)) unique.set(key, material)
  })
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}
