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
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
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

  try {
    const params = new URLSearchParams(window.location.search)
    const hasCampaign = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .some((key) => params.has(key))
    const now = Date.now()
    const stored = sessionStorage.getItem(STORAGE_KEY)
    const previous = stored ? JSON.parse(stored) as { saved_at?: number; data?: MarketingAttribution } : null

    if (hasCampaign) {
      const data: MarketingAttribution = {
        utm_source: clean(params.get('utm_source')),
        utm_medium: clean(params.get('utm_medium')),
        utm_campaign: clean(params.get('utm_campaign')),
        utm_content: clean(params.get('utm_content')),
        utm_term: clean(params.get('utm_term')),
        referrer: clean(previous?.data?.referrer ?? (document.referrer ? new URL(document.referrer).hostname : null), 180),
        landing_path: previous?.data?.landing_path ?? window.location.pathname.slice(0, 300),
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ saved_at: now, data }))
      return data
    }

    if (previous?.data && typeof previous.saved_at === 'number' && now - previous.saved_at < MAX_AGE_MS) {
      return { ...empty, ...previous.data, landing_path: previous.data.landing_path || empty.landing_path }
    }

    const data = {
      ...empty,
      utm_source: clean(document.referrer ? new URL(document.referrer).hostname : null),
      referrer: clean(document.referrer ? new URL(document.referrer).hostname : null, 180),
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ saved_at: now, data }))
    return data
  } catch {
    return empty
  }
}
