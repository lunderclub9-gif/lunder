import { describe, expect, it } from 'vitest'
import {
  calculateCustomManufacturingCost,
  type CustomManufacturingCostInput,
} from './custom-manufacturing-cost'

const base: CustomManufacturingCostInput = {
  materials: [
    { id: 'pvc', name: 'PVC Board', unitType: 'piece', unitCostDzd: 1500, unitCostConfigured: true },
    { id: 'alu', name: 'Aluminium', unitType: 'meter', unitCostDzd: 450, unitCostConfigured: true },
    { id: 'paint', name: 'Paint', unitType: 'kg', unitCostDzd: 900, unitCostConfigured: true },
    { id: 'panel', name: 'Panel', unitType: 'm2', unitCostDzd: 2000, unitCostConfigured: true },
  ],
  lines: [
    { materialId: 'pvc', quantity: 12 },
    { materialId: 'alu', quantity: 8 },
  ],
  settings: {
    laborHourRateDzd: 600,
    machineHourRateDzd: 800,
    assemblyHourRateDzd: 600,
    finishingHourRateDzd: 400,
    wastePercent: 10,
    taxPercent: 19,
    marginPercent: 20,
    minimumQuoteDzd: 1000,
  },
  laborMinutes: 120,
  machineHours: 2,
  assemblyMinutes: 30,
  finishingMinutes: 45,
  packagingDzd: 500,
  transportDzd: 700,
  extraDzd: 200,
}

describe('calculateCustomManufacturingCost', () => {
  it('calculates piece and meter materials, waste, labour, machine, finishing, fixed costs, margin and tax', () => {
    const result = calculateCustomManufacturingCost(base)

    expect(result.materials[0].lineCostDzd).toBe(19800)
    expect(result.materials[1].lineCostDzd).toBe(3960)
    expect(result.materialCostDzd).toBe(23760)
    expect(result.laborCostDzd).toBe(1200)
    expect(result.machineCostDzd).toBe(1600)
    expect(result.assemblyCostDzd).toBe(300)
    expect(result.finishingCostDzd).toBe(300)
    expect(result.costBeforeMarginDzd).toBe(28560)
    expect(result.profitDzd).toBe(7140)
    expect(result.sellingBeforeTaxDzd).toBe(35700)
    expect(result.taxDzd).toBe(6783)
    expect(result.finalPriceDzd).toBe(42483)
    expect(result.estimatedProductionHours).toBe(5.25)
  })

  it('supports square-metre and kilogram material price units', () => {
    const result = calculateCustomManufacturingCost({
      ...base,
      lines: [
        { materialId: 'panel', quantity: 2.5 },
        { materialId: 'paint', quantity: 1.2 },
      ],
      laborMinutes: 0,
      machineHours: 0,
      assemblyMinutes: 0,
      finishingMinutes: 0,
      packagingDzd: 0,
      transportDzd: 0,
      extraDzd: 0,
      settings: { ...base.settings, wastePercent: 0, marginPercent: 0, taxPercent: 0 },
    })
    expect(result.materialCostDzd).toBe(6080)
    expect(result.finalPriceDzd).toBe(6080)
  })

  it('refuses unconfigured material prices instead of silently using zero', () => {
    expect(() => calculateCustomManufacturingCost({
      ...base,
      materials: [{ ...base.materials[0], unitCostConfigured: false }],
      lines: [{ materialId: 'pvc', quantity: 1 }],
      laborMinutes: 0,
      machineHours: 0,
      assemblyMinutes: 0,
      finishingMinutes: 0,
      packagingDzd: 0,
      transportDzd: 0,
      extraDzd: 0,
    })).toThrow('PRIX_MATIERE_NON_CONFIGURE')
  })

  it('requires configured hourly rates when the corresponding time is entered', () => {
    expect(() => calculateCustomManufacturingCost({
      ...base,
      lines: [],
      machineHours: 1,
      settings: { ...base.settings, machineHourRateDzd: 0 },
    })).toThrow('TAUX_MACHINE_NON_CONFIGURE')
  })

  it('keeps profit and tax consistent when the minimum quote floor applies', () => {
    const result = calculateCustomManufacturingCost({
      ...base,
      settings: { ...base.settings, taxPercent: 10, minimumQuoteDzd: 50_000 },
    })
    expect(result.sellingBeforeTaxDzd).toBe(45_455)
    expect(result.profitDzd).toBe(16_895)
    expect(result.taxDzd).toBe(4_546)
    expect(result.finalPriceDzd).toBe(50_001)
  })

  it('rejects invalid quantities and an empty zero-cost estimate', () => {
    expect(() => calculateCustomManufacturingCost({
      ...base,
      lines: [{ materialId: 'pvc', quantity: 0 }],
    })).toThrow('QUANTITE_MATIERE_INVALIDE')

    expect(() => calculateCustomManufacturingCost({
      ...base,
      lines: [],
      laborMinutes: 0,
      machineHours: 0,
      assemblyMinutes: 0,
      finishingMinutes: 0,
      packagingDzd: 0,
      transportDzd: 0,
      extraDzd: 0,
    })).toThrow('COUT_TOTAL_NON_CONFIGURE')
  })
})
