import { describe, expect, it } from 'vitest'
import { calculatePrintScale, getThermalPageHeightMm } from './print-fit'

describe('print fitting', () => {
  it('does not enlarge content that already fits', () => {
    expect(calculatePrintScale(400, 500, 210, 297)).toBe(1)
  })

  it('scales proportionally to fit both printable dimensions', () => {
    const scale = calculatePrintScale(1200, 1800, 100, 150)
    expect(scale).toBeCloseTo(Math.min((100 * 96) / 25.4 / 1200, (150 * 96) / 25.4 / 1800))
    expect(scale).toBeLessThan(1)
  })

  it('fits width-only thermal media and computes page length after scaling', () => {
    const scale = calculatePrintScale(600, 2400, 56, null)
    expect(scale).toBeLessThan(1)
    expect(getThermalPageHeightMm(2400, scale, 1)).toBeGreaterThan(60)
  })

  it('retains the minimum thermal page length for short notes', () => {
    expect(getThermalPageHeightMm(100, 1, 1)).toBe(60)
  })
})
