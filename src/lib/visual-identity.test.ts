import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VISUAL_IDENTITY,
  contrastRatio,
  normalizeVisualIdentity,
  parseVisualIdentity,
  visualIdentityCssVars,
} from './visual-identity'

describe('visual identity configuration', () => {
  it('returns a fresh safe default for invalid persisted values', () => {
    const first = normalizeVisualIdentity(null)
    first.colors.primary = '#000000'
    expect(normalizeVisualIdentity([])).toEqual(DEFAULT_VISUAL_IDENTITY)
    expect(normalizeVisualIdentity(null).colors.primary).toBe(DEFAULT_VISUAL_IDENTITY.colors.primary)
  })

  it('merges partial saved settings with defaults for newly added fields', () => {
    const config = normalizeVisualIdentity({
      version: 1,
      colors: { primary: '#123456' },
      content: { heroTitle: 'Mon atelier' },
    })
    expect(config.colors.primary).toBe('#123456')
    expect(config.colors.background).toBe(DEFAULT_VISUAL_IDENTITY.colors.background)
    expect(config.content.heroTitle).toBe('Mon atelier')
    expect(config.content.heroHighlight).toBe(DEFAULT_VISUAL_IDENTITY.content.heroHighlight)
    expect(config.motion).toEqual(DEFAULT_VISUAL_IDENTITY.motion)
  })

  it('parses valid JSON and safely falls back for malformed JSON', () => {
    expect(parseVisualIdentity(JSON.stringify({ colors: { primary: '#abcdef' } })).colors.primary).toBe('#abcdef')
    expect(parseVisualIdentity('{invalid').colors).toEqual(DEFAULT_VISUAL_IDENTITY.colors)
  })

  it('calculates WCAG contrast ratios for black and white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeLessThan(4.5)
  })

  it('exposes typography, motion and color tokens as CSS variables', () => {
    const vars = visualIdentityCssVars(DEFAULT_VISUAL_IDENTITY) as Record<string, string>
    expect(vars['--vi-primary']).toBe(DEFAULT_VISUAL_IDENTITY.colors.primary)
    expect(vars['--vi-radius']).toBe('16px')
    expect(vars['--vi-motion-duration']).toBe('0.55s')
    expect(vars['--vi-body-font']).toContain('Inter')
  })
})
