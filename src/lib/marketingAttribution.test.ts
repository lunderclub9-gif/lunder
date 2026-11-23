import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMarketingAttribution } from './marketingAttribution'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

describe('getMarketingAttribution', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    vi.restoreAllMocks()
    storage = createStorage()
    vi.stubGlobal('sessionStorage', storage)
    vi.stubGlobal('window', {
      location: {
        pathname: '/boutique/produits/test',
        search: '?utm_source=facebook&utm_medium=paid_social&utm_campaign=launch&utm_content=video_1&utm_term=3d',
      },
    })
    vi.stubGlobal('document', { referrer: 'https://m.facebook.com/some/path' })
  })

  it('captures and normalizes UTM values from the landing URL', () => {
    expect(getMarketingAttribution()).toEqual({
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: 'launch',
      utm_content: 'video_1',
      utm_term: '3d',
      referrer: 'm.facebook.com',
      landing_path: '/boutique/produits/test',
    })
  })

  it('keeps the first-touch attribution for the current tab', () => {
    const first = getMarketingAttribution()
    vi.stubGlobal('window', {
      location: { pathname: '/boutique/autre', search: '?utm_source=tiktok&utm_campaign=second' },
    })
    vi.stubGlobal('document', { referrer: 'https://tiktok.com/' })

    expect(getMarketingAttribution()).toEqual(first)
  })

  it('uses the referrer hostname when no UTM parameters are present', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/boutique', search: '' },
    })

    expect(getMarketingAttribution()).toEqual({
      utm_source: 'm.facebook.com',
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: 'm.facebook.com',
      landing_path: '/boutique',
    })
  })

  it('fails safely when session storage contains malformed JSON', () => {
    storage.setItem('lunder_marketing_attribution_v1', '{invalid')

    expect(getMarketingAttribution()).toEqual({
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: 'launch',
      utm_content: 'video_1',
      utm_term: '3d',
      referrer: 'm.facebook.com',
      landing_path: '/boutique/produits/test',
    })
  })

  it('keeps current campaign data when browser storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('storage disabled') },
      setItem: () => { throw new Error('storage disabled') },
    })

    expect(getMarketingAttribution().landing_path).toBe('/boutique/produits/test')
    expect(getMarketingAttribution().utm_source).toBe('facebook')
  })
})
