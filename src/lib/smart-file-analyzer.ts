export type ExtractedMaterial = {
  sourceRow: number
  materialName: string
  quantity: string
  unit: 'piece' | 'meter' | 'm2' | 'kg' | ''
  unitPriceDzd: string
  lineTotalDzd: string
  dimensions: string
  technicalSpecification: string
  supplier: string
  reference: string
  confidence: 'high' | 'medium' | 'low'
  issues: string[]
}

export type CsvAnalysis = {
  headers: string[]
  rows: ExtractedMaterial[]
  ignoredRows: number
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim())
      value = ''
    } else {
      value += char
    }
  }
  if (quoted) throw new Error('CSV_GUILLEMET_NON_FERME')
  cells.push(value.trim())
  return cells
}

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.includes(normalizeHeader(header)))
}

function parseUnit(value: string): ExtractedMaterial['unit'] {
  const unit = normalizeHeader(value)
  if (['piece', 'pieces', 'pcs', 'unite', 'unites', 'u'].includes(unit)) return 'piece'
  if (['m', 'meter', 'meters', 'metre', 'metres', 'ml', 'linear'].includes(unit)) return 'meter'
  if (['m2', 'sqm', 'squaremeter', 'metrecarré', 'metrecarré'].includes(unit)) return 'm2'
  if (['kg', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes'].includes(unit)) return 'kg'
  return ''
}

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/\s/g, '').replace(/(DA|DZD|دج)/gi, '').replace(',', '.')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function cell(cells: string[], column: number): string {
  return column >= 0 ? (cells[column] ?? '') : ''
}

export function analyzeMaterialsCsv(source: string): CsvAnalysis {
  const text = source.replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('FICHIER_VIDE')
  const firstLine = text.split(/\r?\n/, 1)[0]
  const delimiter = [',', ';', '\t'].sort((a, b) =>
    splitCsvLine(firstLine, b).length - splitCsvLine(firstLine, a).length
  )[0]
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) throw new Error('AUCUNE_LIGNE_DONNEES')

  const headers = splitCsvLine(lines[0], delimiter)
  const materialCol = findColumn(headers, ['material', 'materialname', 'name', 'matiere', 'nommatiere', 'designation', 'article', 'produit'])
  const quantityCol = findColumn(headers, ['quantity', 'qty', 'quantite', 'qte'])
  const unitCol = findColumn(headers, ['unit', 'unite', 'measurementunit'])
  const priceCol = findColumn(headers, ['unitprice', 'priceperunit', 'unitcost', 'prixunitaire', 'coutunitaire', 'prixachat'])
  const totalCol = findColumn(headers, ['total', 'linetotal', 'amount', 'montant', 'totaldzd', 'totalttc'])
  const supplierCol = findColumn(headers, ['supplier', 'fournisseur', 'suppliername'])
  const referenceCol = findColumn(headers, ['reference', 'ref', 'sku', 'code'])
  const dimensionsCol = findColumn(headers, ['dimensions', 'dimension', 'size', 'taille', 'dimensionsmm', 'dimensionscm'])
  const lengthCol = findColumn(headers, ['length', 'longueur', 'longueurmm', 'lengthmm'])
  const widthCol = findColumn(headers, ['width', 'largeur', 'largeurmm', 'widthmm'])
  const heightCol = findColumn(headers, ['height', 'hauteur', 'hauteurmm', 'heightmm'])
  const specificationCol = findColumn(headers, ['specification', 'specifications', 'technicalspecification', 'descriptiontechnique', 'notes', 'bom', 'cuttinglist'])

  if (materialCol < 0 || quantityCol < 0 || priceCol < 0) {
    throw new Error('COLONNES_REQUISES: material, quantity, unit price')
  }

  const rows: ExtractedMaterial[] = []
  let ignoredRows = 0
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index], delimiter)
    const materialName = cell(cells, materialCol)
    if (!materialName) {
      ignoredRows += 1
      continue
    }
    const quantityRaw = cell(cells, quantityCol)
    const priceRaw = cell(cells, priceCol)
    const totalRaw = cell(cells, totalCol)
    const quantity = parseNumeric(quantityRaw)
    const unitPrice = parseNumeric(priceRaw)
    const lineTotal = parseNumeric(totalRaw)
    const unit = unitCol >= 0 ? parseUnit(cell(cells, unitCol)) : ''
    const dimensionParts = [
      dimensionsCol >= 0 ? cell(cells, dimensionsCol) : '',
      lengthCol >= 0 ? `L: ${cell(cells, lengthCol)}` : '',
      widthCol >= 0 ? `W: ${cell(cells, widthCol)}` : '',
      heightCol >= 0 ? `H: ${cell(cells, heightCol)}` : '',
    ].filter(Boolean)
    const dimensions = dimensionParts.join(' × ')
    const issues: string[] = []
    if (quantity === null || quantity <= 0) issues.push('Quantité absente ou invalide')
    if (unitPrice === null || unitPrice <= 0) issues.push('Prix unitaire absent ou invalide')
    if (!unit) issues.push('Unité non reconnue')
    if (totalRaw && (lineTotal === null || lineTotal <= 0)) issues.push('Total de ligne invalide')
    if (lineTotal !== null && quantity !== null && unitPrice !== null && quantity > 0 && unitPrice > 0) {
      const expected = quantity * unitPrice
      if (Math.abs(lineTotal - expected) > Math.max(1, expected * 0.01)) {
        issues.push('Total de ligne différent de quantité × prix unitaire')
      }
    }
    rows.push({
      sourceRow: index + 1,
      materialName,
      quantity: quantity === null ? quantityRaw : String(quantity),
      unit,
      unitPriceDzd: unitPrice === null ? priceRaw : String(unitPrice),
      lineTotalDzd: lineTotal === null ? totalRaw : String(lineTotal),
      dimensions,
      technicalSpecification: cell(cells, specificationCol),
      supplier: cell(cells, supplierCol),
      reference: cell(cells, referenceCol),
      confidence: issues.length === 0 ? 'high' : issues.length === 1 ? 'medium' : 'low',
      issues,
    })
  }

  return { headers, rows, ignoredRows }
}

export function validateExtractedMaterial(row: ExtractedMaterial): string[] {
  const issues: string[] = []
  if (!row.materialName.trim()) issues.push('Nom de matière requis')
  const quantity = parseNumeric(row.quantity)
  if (quantity === null || quantity <= 0) issues.push('Quantité invalide')
  const price = parseNumeric(row.unitPriceDzd)
  if (price === null || price <= 0 || !Number.isSafeInteger(price)) issues.push('Prix unitaire invalide (DZD entier requis)')
  if (!row.unit) issues.push('Unité requise')
  if (row.lineTotalDzd.trim()) {
    const total = parseNumeric(row.lineTotalDzd)
    if (total === null || total <= 0) issues.push('Total de ligne invalide')
    else if (quantity !== null && price !== null && quantity > 0 && price > 0) {
      const expected = quantity * price
      if (Math.abs(total - expected) > Math.max(1, expected * 0.01)) {
        issues.push('Total de ligne différent de quantité × prix unitaire')
      }
    }
  }
  return issues
}

/** Returns row indexes with repeated normalized material + unit pairs. */
export function findDuplicateMaterialRows(rows: ExtractedMaterial[]): Set<number> {
  const groups = new Map<string, number[]>()
  rows.forEach((row, index) => {
    const key = `${normalizeHeader(row.materialName)}::${row.unit}`
    if (!row.materialName.trim() || !row.unit) return
    groups.set(key, [...(groups.get(key) ?? []), index])
  })
  return new Set([...groups.values()].filter((indexes) => indexes.length > 1).flat())
}

export type SupplierComparisonRow = {
  materialName: string
  unit: Exclude<ExtractedMaterial['unit'], ''>
  firstPriceDzd: number
  secondPriceDzd: number
  differenceDzd: number
  differencePercent: number
  cheaper: 'first' | 'second' | 'same'
  firstSupplier: string
  secondSupplier: string
}

export type SupplierQuoteComparison = {
  matched: SupplierComparisonRow[]
  onlyFirst: string[]
  onlySecond: string[]
}

/** Compares two reviewed supplier CSVs by normalized material name and unit. */
export function compareSupplierQuotes(first: CsvAnalysis, second: CsvAnalysis): SupplierQuoteComparison {
  const toMap = (analysis: CsvAnalysis) => {
    const map = new Map<string, ExtractedMaterial>()
    for (const row of analysis.rows) {
      if (validateExtractedMaterial(row).length > 0 || !row.unit) continue
      const key = `${normalizeHeader(row.materialName)}::${row.unit}`
      if (map.has(key)) throw new Error('MATERIAU_DUPLIQUE_DANS_DEVIS_FOURNISSEUR')
      map.set(key, row)
    }
    return map
  }

  const firstRows = toMap(first)
  const secondRows = toMap(second)
  const matched: SupplierComparisonRow[] = []
  const onlyFirst: string[] = []
  const onlySecond: string[] = []

  for (const [key, row] of firstRows) {
    const other = secondRows.get(key)
    if (!other) {
      onlyFirst.push(row.materialName)
      continue
    }
    const firstPriceDzd = Number(row.unitPriceDzd)
    const secondPriceDzd = Number(other.unitPriceDzd)
    const differenceDzd = secondPriceDzd - firstPriceDzd
    matched.push({
      materialName: row.materialName,
      unit: row.unit as Exclude<ExtractedMaterial['unit'], ''>,
      firstPriceDzd,
      secondPriceDzd,
      differenceDzd,
      differencePercent: firstPriceDzd > 0 ? (differenceDzd / firstPriceDzd) * 100 : 0,
      cheaper: firstPriceDzd < secondPriceDzd ? 'first' : firstPriceDzd > secondPriceDzd ? 'second' : 'same',
      firstSupplier: row.supplier,
      secondSupplier: other.supplier,
    })
  }

  for (const [key, row] of secondRows) {
    if (!firstRows.has(key)) onlySecond.push(row.materialName)
  }

  return { matched, onlyFirst, onlySecond }
}
