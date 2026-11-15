import { describe, expect, it } from 'vitest'
import { getMarginMm, getPaperDimensions } from './print-layout'

describe('getPaperDimensions', () => {
  it('uses the standard A4 and A5 dimensions in portrait', () => {
    expect(getPaperDimensions('a4', 'portrait', 100, 150)).toEqual({ widthMm: 210, heightMm: 297 })
    expect(getPaperDimensions('a5', 'portrait', 100, 150)).toEqual({ widthMm: 148, heightMm: 210 })
  })

  it('swaps standard paper dimensions in landscape', () => {
    expect(getPaperDimensions('a6', 'landscape', 100, 150)).toEqual({ widthMm: 148, heightMm: 105 })
    expect(getPaperDimensions('letter', 'landscape', 100, 150)).toEqual({ widthMm: 279.4, heightMm: 215.9 })
  })

  it('keeps thermal widths and accepts bounded custom dimensions', () => {
    expect(getPaperDimensions('thermal58', 'landscape', 100, 150)).toEqual({ widthMm: 58, heightMm: null })
    expect(getPaperDimensions('custom', 'portrait', 90, 130)).toEqual({ widthMm: 90, heightMm: 130 })
    expect(getPaperDimensions('custom', 'landscape', 90, 130)).toEqual({ widthMm: 130, heightMm: 90 })
    expect(getPaperDimensions('custom', 'portrait', Number.NaN, 900)).toEqual({ widthMm: 100, heightMm: 700 })
  })
})

describe('getMarginMm', () => {
  it('provides sensible standard, narrow and custom margins', () => {
    expect(getMarginMm('a4', 'default', 10)).toBe(12)
    expect(getMarginMm('a4', 'narrow', 10)).toBe(5)
    expect(getMarginMm('a4', 'custom', 10)).toBe(10)
    expect(getMarginMm('a4', 'custom', 80)).toBe(30)
  })

  it('keeps thermal margins compact', () => {
    expect(getMarginMm('thermal80', 'default', 10)).toBe(1)
    expect(getMarginMm('thermal58', 'custom', 2)).toBe(2)
  })
})
