export type ExtractedMaterial = {
  sourceRow: number
  materialName: string
  quantity: string
  unit: 'piece' | 'meter' | 'm2' | 'kg' | ''
  unitPriceDzd: string
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
  const supplierCol = findColumn(headers, ['supplier', 'fournisseur', 'suppliername'])
  const referenceCol = findColumn(headers, ['reference', 'ref', 'sku', 'code'])

  if (materialCol < 0 || quantityCol < 0 || priceCol < 0) {
    throw new Error('COLONNES_REQUISES: material, quantity, unit price')
  }

  const rows: ExtractedMaterial[] = []
  let ignoredRows = 0
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index], delimiter)
    const materialName = cells[materialCol] ?? ''
    if (!materialName) {
      ignoredRows += 1
      continue
    }
    const quantityRaw = cells[quantityCol] ?? ''
    const priceRaw = cells[priceCol] ?? ''
    const quantity = parseNumeric(quantityRaw)
    const unitPrice = parseNumeric(priceRaw)
    const unit = unitCol >= 0 ? parseUnit(cells[unitCol] ?? '') : ''
    const issues: string[] = []
    if (quantity === null || quantity <= 0) issues.push('Quantité absente ou invalide')
    if (unitPrice === null || unitPrice <= 0) issues.push('Prix unitaire absent ou invalide')
    if (!unit) issues.push('Unité non reconnue')
    rows.push({
      sourceRow: index + 1,
      materialName,
      quantity: quantity === null ? quantityRaw : String(quantity),
      unit,
      unitPriceDzd: unitPrice === null ? priceRaw : String(unitPrice),
      supplier: supplierCol >= 0 ? (cells[supplierCol] ?? '') : '',
      reference: referenceCol >= 0 ? (cells[referenceCol] ?? '') : '',
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
  return issues
}
