/** Historique de recherche local : chaînes courtes, uniques, récentes d'abord. */

export const RECENT_SEARCHES_KEY = 'lunders_recherches_v1'
export const RECENT_SEARCHES_LIMIT = 5

export function normalizeRecentSearches(value: unknown, limit = RECENT_SEARCHES_LIMIT): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const terms: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const term = entry.trim().slice(0, 60)
    if (term.length < 2) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    terms.push(term)
    if (terms.length >= limit) break
  }
  return terms
}

export function addRecentSearch(list: string[], term: string, limit = RECENT_SEARCHES_LIMIT): string[] {
  return normalizeRecentSearches([term, ...list], limit)
}

export function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    return normalizeRecentSearches(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function writeRecentSearches(terms: string[]): void {
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(normalizeRecentSearches(terms)))
  } catch {
    /* stockage indisponible : l'historique reste en mémoire */
  }
}
