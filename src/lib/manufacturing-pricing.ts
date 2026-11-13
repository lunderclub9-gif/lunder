/**
 * Moteur de tarification de la fabrication sur mesure — LUNDER'S 3D STUDIO.
 *
 * Ce module est la référence unique du calcul. Les mêmes règles vivent en SQL
 * (migration 008) et sont appliquées côté serveur : le prix affiché ici est une
 * estimation, le prix qui fait foi est celui recalculé par
 * `quote_custom_manufacturing`. Aucun total envoyé par le navigateur n'est
 * accepté comme autoritaire.
 *
 * Tous les montants sont des dinars entiers (DZD). Aucun flottant ne sort de ce
 * module : chaque ligne est arrondie au dinar, puis le total est la somme des
 * lignes arrondies, pour que l'addition affichée soit exacte.
 */

export type ManufacturingMaterial = {
  name: string
  /** Prix du gramme en DZD. */
  pricePerGramDzd: number
  /** Multiplicateur propre à la matière (difficulté, densité, casse). */
  multiplier: number
  colors: string[]
  available: boolean
}

export type QuantityDiscount = {
  minQuantity: number
  /** Remise en pourcentage appliquée à partir de cette quantité. */
  percent: number
}

export type ManufacturingPricingRules = {
  materials: ManufacturingMaterial[]
  /** Temps machine facturé au client, par heure. */
  pricePerHourDzd: number
  /** Coût d'exploitation machine répercuté, par heure. */
  machineHourlyCostDzd: number
  /** Électricité, par heure. */
  electricityPerHourDzd: number
  /** Plancher de facturation pour une impression. */
  minimumPrintChargeDzd: number
  /** Supplément de production fixe (préparation plateau, purge, etc.). */
  extraProductionDzd: number
  designPreparationFeeDzd: number
  modelingFeeDzd: number
  assemblyFeeDzd: number
  finishingFeeDzd: number
  paintingFeeDzd: number
  /** Marge appliquée à la production, en pourcentage. */
  marginPercent: number
  minimumOrderDzd: number
  complexityFeeDzd: number
  /** Perte matière estimée, en pourcentage du poids. */
  wastePercent: number
  quantityDiscounts: QuantityDiscount[]
  /** Supplément pour production urgente, en pourcentage. */
  rushFeePercent: number
  /** Durée de validité d'un devis automatique, en jours. */
  validityDays: number
}

export type ManufacturingQuoteInput = {
  materialName: string
  /** Poids matière estimé, en grammes. */
  grams: number
  /** Temps d'impression estimé, en heures (décimales acceptées). */
  printHours: number
  quantity: number
  rush?: boolean
  options?: {
    design?: boolean
    modeling?: boolean
    assembly?: boolean
    finishing?: boolean
    painting?: boolean
  }
}

export type QuoteLine = {
  label: string
  amountDzd: number
  /** Détail lisible destiné au client, sans donnée interne. */
  detail: string | null
}

export type ManufacturingQuote = {
  lines: QuoteLine[]
  unitProductionCostDzd: number
  unitPriceDzd: number
  quantity: number
  subtotalDzd: number
  discountPercent: number
  discountDzd: number
  rushFeeDzd: number
  totalDzd: number
  material: string
  /** Hypothèses explicites : rien n'est présenté comme une garantie. */
  assumptions: string[]
  /** Faux si l'estimation repose sur des valeurs saisies, pas mesurées. */
  geometryVerified: boolean
}

const round = (value: number): number => Math.round(Number.isFinite(value) ? value : 0)

export function findMaterial(
  rules: ManufacturingPricingRules,
  materialName: string
): ManufacturingMaterial | null {
  const wanted = materialName.trim().toLowerCase()
  const material = rules.materials.find((candidate) => candidate.name.trim().toLowerCase() === wanted)
  return material && material.available ? material : null
}

export function discountForQuantity(
  rules: ManufacturingPricingRules,
  quantity: number
): number {
  const applicable = [...rules.quantityDiscounts]
    .filter((tier) => quantity >= tier.minQuantity && tier.percent > 0)
    .sort((a, b) => b.percent - a.percent)[0]
  return applicable ? Math.min(90, applicable.percent) : 0
}

/**
 * Calcule une estimation détaillée.
 *
 * Lève une erreur plutôt que de renvoyer un prix inventé lorsque la matière est
 * indisponible ou que les mesures sont incohérentes : mieux vaut demander une
 * information au client que d'afficher un montant faux.
 */
export function calculateManufacturingQuote(
  rules: ManufacturingPricingRules,
  input: ManufacturingQuoteInput
): ManufacturingQuote {
  const material = findMaterial(rules, input.materialName)
  if (!material) {
    throw new Error('MATIERE_INDISPONIBLE')
  }
  if (!Number.isFinite(input.grams) || input.grams <= 0) {
    throw new Error('POIDS_INVALIDE')
  }
  if (!Number.isFinite(input.printHours) || input.printHours <= 0) {
    throw new Error('TEMPS_INVALIDE')
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
    throw new Error('QUANTITE_INVALIDE')
  }

  const quantity = input.quantity
  const gramsWithWaste = input.grams * (1 + Math.max(0, rules.wastePercent) / 100)

  const materialCost = round(
    gramsWithWaste * material.pricePerGramDzd * Math.max(0.01, material.multiplier)
  )

  const hourlyCost =
    Math.max(0, rules.pricePerHourDzd) +
    Math.max(0, rules.machineHourlyCostDzd) +
    Math.max(0, rules.electricityPerHourDzd)
  const printingCost = Math.max(round(input.printHours * hourlyCost), round(rules.minimumPrintChargeDzd))

  const options = input.options ?? {}
  const laborLines: QuoteLine[] = []

  if (options.design) {
    laborLines.push({
      label: 'Préparation du design',
      amountDzd: round(rules.designPreparationFeeDzd),
      detail: null,
    })
  }
  if (options.modeling) {
    laborLines.push({
      label: 'Modélisation / modification',
      amountDzd: round(rules.modelingFeeDzd),
      detail: null,
    })
  }
  if (options.assembly) {
    laborLines.push({ label: 'Assemblage', amountDzd: round(rules.assemblyFeeDzd), detail: null })
  }
  if (options.finishing) {
    laborLines.push({
      label: 'Ponçage et finition',
      amountDzd: round(rules.finishingFeeDzd),
      detail: null,
    })
  }
  if (options.painting) {
    laborLines.push({ label: 'Peinture', amountDzd: round(rules.paintingFeeDzd), detail: null })
  }

  const laborTotal = laborLines.reduce((sum, line) => sum + line.amountDzd, 0)

  const productionCost = round(
    materialCost + printingCost + laborTotal + Math.max(0, rules.extraProductionDzd)
  )

  const complexity = round(Math.max(0, rules.complexityFeeDzd))
  const costWithComplexity = round(productionCost + complexity)

  const marginPercent = Math.min(200, Math.max(0, rules.marginPercent))
  const margin = round((costWithComplexity * marginPercent) / 100)

  const unitPrice = Math.max(round(costWithComplexity + margin), round(rules.minimumOrderDzd))

  const subtotal = round(unitPrice * quantity)
  const discountPercent = discountForQuantity(rules, quantity)
  const discount = round((subtotal * discountPercent) / 100)
  const rushPercent = input.rush ? Math.max(0, rules.rushFeePercent) : 0
  const rushFee = round(((subtotal - discount) * rushPercent) / 100)

  const total = Math.max(round(subtotal - discount + rushFee), round(rules.minimumOrderDzd))

  const lines: QuoteLine[] = [
    {
      label: 'Matière',
      amountDzd: materialCost,
      detail: `${material.name} · ${round(gramsWithWaste)} g × ${round(material.pricePerGramDzd)} DA/g (perte ${Math.max(0, rules.wastePercent)} %)`,
    },
    {
      label: 'Impression',
      amountDzd: printingCost,
      detail: `${formatHours(input.printHours)} h × ${round(hourlyCost)} DA/h`,
    },
    ...laborLines,
  ]

  if (complexity > 0) {
    lines.push({ label: 'Complexité', amountDzd: complexity, detail: null })
  }
  if (margin > 0) {
    lines.push({ label: 'Marge studio', amountDzd: margin, detail: `${marginPercent} %` })
  }

  return {
    lines,
    unitProductionCostDzd: productionCost,
    unitPriceDzd: unitPrice,
    quantity,
    subtotalDzd: subtotal,
    discountPercent,
    discountDzd: discount,
    rushFeeDzd: rushFee,
    totalDzd: total,
    material: material.name,
    geometryVerified: false,
    assumptions: [
      'Le poids de matière et le temps d’impression sont des estimations de production, pas des mesures garanties.',
      'Le prix ferme est confirmé par le studio après réception du fichier ou des dimensions définitives.',
      'Les frais de livraison sont calculés séparément selon la wilaya et la commune.',
    ],
  }
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

/** Valide des dimensions en millimètres et renvoie un message d'erreur ou null. */
export function validateDimensionsMm(input: {
  length?: number | null
  width?: number | null
  height?: number | null
  diameter?: number | null
  thickness?: number | null
}): string | null {
  const entries = Object.entries(input).filter(([, value]) => value !== null && value !== undefined)
  if (entries.length === 0) return 'Renseignez au moins une dimension.'

  for (const [key, value] of entries) {
    if (!Number.isFinite(value as number)) return 'Les dimensions doivent être des nombres.'
    if ((value as number) <= 0) return 'Les dimensions doivent être supérieures à zéro.'
    if ((value as number) > 2000) {
      return key === 'thickness'
        ? 'L’épaisseur ne peut pas dépasser 2000 mm.'
        : 'Une dimension dépasse 2000 mm : contactez-nous pour un devis manuel.'
    }
  }
  return null
}
