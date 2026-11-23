const STORAGE_KEY = 'lunder_marketing_attribution_v1'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type MarketingAttribution = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer: string | null
  landing_path: string
}

function clean(value: string | null, max = 120): string | null {
  if (!value) return null
  const normalized = Array.from(value.trim())
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .slice(0, max)
  return normalized || null
}

/** First-touch campaign data for this browser tab; no cookies or personal data. */
export function getMarketingAttribution(): MarketingAttribution {
  const empty: MarketingAttribution = {
    utm_source: null, utm_medium: null, utm_campaign: null,
    utm_content: null, utm_term: null, referrer: null,
    landing_path: typeof window === 'undefined' ? '/' : window.location.pathname.slice(0, 300),
  }
  if (typeof window === 'undefined') return empty

  const params = new URLSearchParams(window.location.search)
  const hasCampaign = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    .some((key) => params.has(key))
  const now = Date.now()

  // A broken or blocked sessionStorage must not discard campaign data from the URL.
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    const previous = stored
      ? JSON.parse(stored) as { saved_at?: number; data?: MarketingAttribution }
      : null
    const age = previous?.saved_at === undefined ? -1 : now - previous.saved_at
    if (
      previous?.data &&
      typeof previous.saved_at === 'number' &&
      age >= 0 &&
      age < MAX_AGE_MS
    ) {
      return { ...empty, ...previous.data, landing_path: previous.data.landing_path || empty.landing_path }
    }
  } catch {
    // Ignore malformed or unavailable browser storage and use the current visit.
  }

  let referrer: string | null = null
  try {
    referrer = clean(document.referrer ? new URL(document.referrer).hostname : null, 180)
  } catch {
    // An invalid referrer must not prevent valid UTM parameters from being captured.
  }

  const data: MarketingAttribution = hasCampaign
    ? {
        utm_source: clean(params.get('utm_source')),
        utm_medium: clean(params.get('utm_medium')),
        utm_campaign: clean(params.get('utm_campaign')),
        utm_content: clean(params.get('utm_content')),
        utm_term: clean(params.get('utm_term')),
        referrer,
        landing_path: window.location.pathname.slice(0, 300),
      }
    : {
        ...empty,
        utm_source: referrer,
        referrer,
      }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ saved_at: now, data }))
  } catch {
    // Attribution remains available for this submission even when storage is blocked.
  }
  return data
}
