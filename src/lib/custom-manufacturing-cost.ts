export type ManufacturingUnit = 'piece' | 'meter' | 'm2' | 'kg'

export type CostingMaterial = {
  id: string
  name: string
  unitType: ManufacturingUnit
  unitCostDzd: number
  unitCostConfigured: boolean
}

export type ManufacturingCostSettings = {
  laborHourRateDzd: number
  machineHourRateDzd: number
  assemblyHourRateDzd: number
  finishingHourRateDzd: number
  wastePercent: number
  taxPercent: number
  marginPercent: number
  minimumQuoteDzd: number
}

export type ManufacturingCostLineInput = {
  materialId: string
  quantity: number
}

export type CustomManufacturingCostInput = {
  materials: CostingMaterial[]
  lines: ManufacturingCostLineInput[]
  settings: ManufacturingCostSettings
  laborMinutes: number
  machineHours: number
  assemblyMinutes: number
  finishingMinutes: number
  packagingDzd: number
  transportDzd: number
  extraDzd: number
}

export type CalculatedMaterialLine = {
  materialId: string
  name: string
  unitType: ManufacturingUnit
  quantity: number
  quantityWithWaste: number
  unitCostDzd: number
  lineCostDzd: number
}

export type CustomManufacturingCostEstimate = {
  materials: CalculatedMaterialLine[]
  materialCostDzd: number
  laborCostDzd: number
  machineCostDzd: number
  assemblyCostDzd: number
  finishingCostDzd: number
  packagingDzd: number
  transportDzd: number
  extraDzd: number
  costBeforeMarginDzd: number
  profitDzd: number
  sellingBeforeTaxDzd: number
  taxDzd: number
  finalPriceDzd: number
  marginPercent: number
  taxPercent: number
  wastePercent: number
  estimatedProductionHours: number
}

const roundDzd = (value: number): number => Math.round(value)

function requireNonNegative(name: string, value: number, max = 1_000_000): number {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`COUT_${name.toUpperCase()}_INVALIDE`)
  }
  return value
}

/**
 * Client-side preview for the owner. The database RPC recalculates every line
 * from current server-side material prices and settings before issuing a quote.
 */
export function calculateCustomManufacturingCost(
  input: CustomManufacturingCostInput
): CustomManufacturingCostEstimate {
  const { settings } = input
  const laborMinutes = requireNonNegative('main_oeuvre', input.laborMinutes, 100_000)
  const machineHours = requireNonNegative('machine', input.machineHours, 10_000)
  const assemblyMinutes = requireNonNegative('assemblage', input.assemblyMinutes, 100_000)
  const finishingMinutes = requireNonNegative('finition', input.finishingMinutes, 100_000)
  const packagingDzd = roundDzd(requireNonNegative('emballage', input.packagingDzd))
  const transportDzd = roundDzd(requireNonNegative('transport', input.transportDzd))
  const extraDzd = roundDzd(requireNonNegative('supplement', input.extraDzd))

  const wastePercent = requireNonNegative('perte', settings.wastePercent, 100)
  const taxPercent = requireNonNegative('taxe', settings.taxPercent, 30)
  const marginPercent = requireNonNegative('marge', settings.marginPercent, 90)
  const minimumQuoteDzd = roundDzd(requireNonNegative('minimum', settings.minimumQuoteDzd))

  const laborRate = roundDzd(requireNonNegative('taux_main_oeuvre', settings.laborHourRateDzd))
  const machineRate = roundDzd(requireNonNegative('taux_machine', settings.machineHourRateDzd))
  const assemblyRate = roundDzd(requireNonNegative('taux_assemblage', settings.assemblyHourRateDzd))
  const finishingRate = roundDzd(requireNonNegative('taux_finition', settings.finishingHourRateDzd))

  if (laborMinutes > 0 && laborRate <= 0) throw new Error('TAUX_MAIN_OEUVRE_NON_CONFIGURE')
  if (machineHours > 0 && machineRate <= 0) throw new Error('TAUX_MACHINE_NON_CONFIGURE')
  if (assemblyMinutes > 0 && assemblyRate <= 0) throw new Error('TAUX_ASSEMBLAGE_NON_CONFIGURE')
  if (finishingMinutes > 0 && finishingRate <= 0) throw new Error('TAUX_FINITION_NON_CONFIGURE')

  const materialLines = input.lines.map((line): CalculatedMaterialLine => {
    const quantity = requireNonNegative('quantite_matiere', line.quantity, 10_000_000)
    if (quantity <= 0) throw new Error('QUANTITE_MATIERE_INVALIDE')
    const material = input.materials.find((candidate) => candidate.id === line.materialId)
    if (!material) throw new Error('MATIERE_INTROUVABLE')
    if (!material.unitCostConfigured || !Number.isFinite(material.unitCostDzd) || material.unitCostDzd <= 0) {
      throw new Error('PRIX_MATIERE_NON_CONFIGURE')
    }
    const quantityWithWaste = quantity * (1 + wastePercent / 100)
    return {
      materialId: material.id,
      name: material.name,
      unitType: material.unitType,
      quantity,
      quantityWithWaste,
      unitCostDzd: roundDzd(material.unitCostDzd),
      lineCostDzd: roundDzd(quantityWithWaste * material.unitCostDzd),
    }
  })

  const materialCostDzd = materialLines.reduce((sum, line) => sum + line.lineCostDzd, 0)
  const laborCostDzd = roundDzd((laborMinutes / 60) * laborRate)
  const machineCostDzd = roundDzd(machineHours * machineRate)
  const assemblyCostDzd = roundDzd((assemblyMinutes / 60) * assemblyRate)
  const finishingCostDzd = roundDzd((finishingMinutes / 60) * finishingRate)

  const costBeforeMarginDzd =
    materialCostDzd +
    laborCostDzd +
    machineCostDzd +
    assemblyCostDzd +
    finishingCostDzd +
    packagingDzd +
    transportDzd +
    extraDzd

  if (costBeforeMarginDzd <= 0) throw new Error('COUT_TOTAL_NON_CONFIGURE')

  const sellingBeforeTaxDzd = roundDzd(costBeforeMarginDzd / (1 - marginPercent / 100))
  const profitDzd = sellingBeforeTaxDzd - costBeforeMarginDzd
  const taxDzd = roundDzd((sellingBeforeTaxDzd * taxPercent) / 100)
  const finalPriceDzd = Math.max(sellingBeforeTaxDzd + taxDzd, minimumQuoteDzd)

  if (!Number.isSafeInteger(finalPriceDzd) || finalPriceDzd > 2_147_483_647) {
    throw new Error('PRIX_DEVIS_TROP_ELEVE')
  }

  return {
    materials: materialLines,
    materialCostDzd,
    laborCostDzd,
    machineCostDzd,
    assemblyCostDzd,
    finishingCostDzd,
    packagingDzd,
    transportDzd,
    extraDzd,
    costBeforeMarginDzd,
    profitDzd,
    sellingBeforeTaxDzd,
    taxDzd,
    finalPriceDzd,
    marginPercent,
    taxPercent,
    wastePercent,
    estimatedProductionHours: laborMinutes / 60 + machineHours + assemblyMinutes / 60 + finishingMinutes / 60,
  }
}
