import { describe, expect, it } from 'vitest'
import { calculatePrintScale, getGuardedPrintableArea, getThermalPageHeightMm } from './print-fit'

describe('print fitting', () => {
  it('does not enlarge content that already fits', () => {
    expect(calculatePrintScale(400, 500, 210, 297)).toBe(1)
  })

  it('scales proportionally to fit both printable dimensions', () => {
    const scale = calculatePrintScale(1200, 1800, 100, 150)
    expect(scale).toBeCloseTo(Math.min((100 * 96) / 25.4 / 1200, (150 * 96) / 25.4 / 1800))
    expect(scale).toBeLessThan(1)
  })

  it('reserves a small inset on finite pages to avoid pagination rounding overflow', () => {
    expect(getGuardedPrintableArea(186, 273)).toEqual({ widthMm: 184.5, heightMm: 271.5 })
    expect(getGuardedPrintableArea(56, null)).toEqual({ widthMm: 54.5, heightMm: null })
  })

  it('fits width-only thermal media and rounds the page length up after scaling', () => {
    const scale = calculatePrintScale(600, 2400, 54.5, null)
    const pageHeight = getThermalPageHeightMm(2400, scale, 1)
    expect(scale).toBeLessThan(1)
    expect(pageHeight).toBeGreaterThan(60)
    expect(Number.isInteger(pageHeight)).toBe(true)
  })

  it('retains the minimum thermal page length for short notes', () => {
    expect(getThermalPageHeightMm(100, 1, 1)).toBe(60)
  })
})
