import { describe, expect, it } from 'vitest'
import {
  calculateManufacturingQuote,
  discountForQuantity,
  validateDimensionsMm,
  type ManufacturingPricingRules,
} from './manufacturing-pricing'

const rules: ManufacturingPricingRules = {
  materials: [
    { name: 'PLA', pricePerGramDzd: 4, multiplier: 1, colors: ['Noir'], available: true },
    { name: 'PETG', pricePerGramDzd: 6, multiplier: 1.2, colors: ['Blanc'], available: true },
    { name: 'ABS', pricePerGramDzd: 5, multiplier: 1, colors: [], available: false },
  ],
  pricePerHourDzd: 120,
  machineHourlyCostDzd: 30,
  electricityPerHourDzd: 20,
  minimumPrintChargeDzd: 100,
  extraProductionDzd: 50,
  designPreparationFeeDzd: 300,
  modelingFeeDzd: 800,
  assemblyFeeDzd: 150,
  finishingFeeDzd: 200,
  paintingFeeDzd: 250,
  marginPercent: 40,
  minimumOrderDzd: 500,
  complexityFeeDzd: 0,
  wastePercent: 10,
  quantityDiscounts: [
    { minQuantity: 5, percent: 10 },
    { minQuantity: 10, percent: 15 },
  ],
  rushFeePercent: 25,
  validityDays: 14,
}

const input = { materialName: 'PLA', grams: 100, printHours: 2, quantity: 1 }

describe('calculateManufacturingQuote', () => {
  it('additionne matière, impression, main-d’œuvre et marge', () => {
    const quote = calculateManufacturingQuote(rules, { ...input, options: { finishing: true } })
    // matière : 100 g + 10 % = 110 g × 4 DA = 440
    expect(quote.lines[0].amountDzd).toBe(440)
    // impression : 2 h × 170 DA/h = 340
    expect(quote.lines[1].amountDzd).toBe(340)
    // production : 440 + 340 + 200 (finition) + 50 = 1030, marge 40 % = 412
    expect(quote.unitProductionCostDzd).toBe(1030)
    expect(quote.unitPriceDzd).toBe(1442)
    expect(quote.totalDzd).toBe(1442)
  })

  it('applique le multiplicateur de matière', () => {
    const quote = calculateManufacturingQuote(rules, { ...input, materialName: 'PETG' })
    expect(quote.lines[0].amountDzd).toBe(792) // 110 g × 6 × 1,2
    expect(quote.material).toBe('PETG')
  })

  it('respecte le plancher d’impression et le prix minimum de commande', () => {
    const quote = calculateManufacturingQuote(rules, {
      materialName: 'PLA',
      grams: 1,
      printHours: 0.1,
      quantity: 1,
    })
    expect(quote.lines[1].amountDzd).toBe(100)
    expect(quote.totalDzd).toBeGreaterThanOrEqual(rules.minimumOrderDzd)
  })

  it('applique la remise quantité, puis le supplément urgence', () => {
    const quote = calculateManufacturingQuote(rules, {
      ...input,
      quantity: 10,
      rush: true,
      options: { finishing: true },
    })
    expect(quote.discountPercent).toBe(15)
    expect(quote.subtotalDzd).toBe(1442 * 10)
    expect(quote.discountDzd).toBe(Math.round(14420 * 0.15))
    const afterDiscount = 14420 - quote.discountDzd
    expect(quote.rushFeeDzd).toBe(Math.round(afterDiscount * 0.25))
    expect(quote.totalDzd).toBe(afterDiscount + quote.rushFeeDzd)
  })

  it('refuse une matière indisponible ou inconnue', () => {
    expect(() => calculateManufacturingQuote(rules, { ...input, materialName: 'ABS' })).toThrow(
      'MATIERE_INDISPONIBLE'
    )
    expect(() => calculateManufacturingQuote(rules, { ...input, materialName: 'Nylon' })).toThrow(
      'MATIERE_INDISPONIBLE'
    )
  })

  it('refuse des valeurs incohérentes au lieu d’inventer un prix', () => {
    expect(() => calculateManufacturingQuote(rules, { ...input, grams: 0 })).toThrow('POIDS_INVALIDE')
    expect(() => calculateManufacturingQuote(rules, { ...input, printHours: -1 })).toThrow('TEMPS_INVALIDE')
    expect(() => calculateManufacturingQuote(rules, { ...input, quantity: 0 })).toThrow('QUANTITE_INVALIDE')
    expect(() => calculateManufacturingQuote(rules, { ...input, quantity: 101 })).toThrow('QUANTITE_INVALIDE')
  })

  it('annonce ses hypothèses et ne prétend pas avoir vérifié la géométrie', () => {
    const quote = calculateManufacturingQuote(rules, input)
    expect(quote.geometryVerified).toBe(false)
    expect(quote.assumptions.join(' ')).toMatch(/estimation/i)
  })
})

describe('discountForQuantity', () => {
  it('retient le meilleur palier atteint', () => {
    expect(discountForQuantity(rules, 1)).toBe(0)
    expect(discountForQuantity(rules, 5)).toBe(10)
    expect(discountForQuantity(rules, 12)).toBe(15)
  })
})

describe('validateDimensionsMm', () => {
  it('accepte des dimensions plausibles', () => {
    expect(validateDimensionsMm({ length: 120, width: 80, height: 40 })).toBeNull()
    expect(validateDimensionsMm({ diameter: 60, thickness: 3 })).toBeNull()
  })

  it('refuse une saisie vide, négative ou démesurée', () => {
    expect(validateDimensionsMm({})).toMatch(/au moins une dimension/i)
    expect(validateDimensionsMm({ length: 0 })).toMatch(/supérieures à zéro/i)
    expect(validateDimensionsMm({ length: 5000 })).toMatch(/2000 mm/i)
  })
})
