import { describe, expect, it } from 'vitest'
import { analyzeMaterialsCsv, compareSupplierQuotes, findDuplicateMaterialRows, validateExtractedMaterial } from './smart-file-analyzer'

describe('smart file analyzer CSV extraction', () => {
  it('extracts BOM material rows with semicolon delimiters and quoted values', () => {
    const result = analyzeMaterialsCsv(
      'Material;Quantity;Unit;Unit Price;Supplier;Reference\n"PVC Board";12;Pieces;1500;Supplier A;PVC-01\nAluminum;8;Meters;450;Supplier B;AL-02'
    )
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      materialName: 'PVC Board',
      quantity: '12',
      unit: 'piece',
      unitPriceDzd: '1500',
      supplier: 'Supplier A',
      reference: 'PVC-01',
      confidence: 'high',
    })
    expect(result.rows[1].unit).toBe('meter')
  })

  it('supports comma-decimal prices and UTF-8 BOM', () => {
    const result = analyzeMaterialsCsv('\uFEFFMatière,Quantité,Unité,Prix unitaire\nPeinture,1.5,kg,"950,5"')
    expect(result.rows[0].unitPriceDzd).toBe('950.5')
    expect(result.rows[0].unit).toBe('kg')
  })

  it('flags missing and unrecognized values instead of inventing data', () => {
    const result = analyzeMaterialsCsv('Material,Quantity,Unit,Unit Price\nSteel,,box,')
    expect(result.rows[0].confidence).toBe('low')
    expect(result.rows[0].issues).toHaveLength(3)
    expect(validateExtractedMaterial(result.rows[0])).toContain('Quantité invalide')
  })

  it('rejects files without required material, quantity and price columns', () => {
    expect(() => analyzeMaterialsCsv('Product,Amount\nChair,2')).toThrow('COLONNES_REQUISES')
  })

  it('rejects malformed quoted CSV and empty files', () => {
    expect(() => analyzeMaterialsCsv('Material,Quantity,Unit Price\n"PVC,2,100')).toThrow('CSV_GUILLEMET_NON_FERME')
    expect(() => analyzeMaterialsCsv('  ')).toThrow('FICHIER_VIDE')
  })
  it('compares matched supplier prices and reports unmatched materials', () => {
    const first = analyzeMaterialsCsv('Material,Quantity,Unit,Unit Price,Supplier\nPVC Board,1,piece,1500,Alpha\nAluminum,1,meter,450,Alpha')
    const second = analyzeMaterialsCsv('Material,Quantity,Unit,Unit Price,Supplier\nPVC Board,1,piece,1350,Beta\nSteel,1,kg,700,Beta')
    const result = compareSupplierQuotes(first, second)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0]).toMatchObject({
      materialName: 'PVC Board',
      firstPriceDzd: 1500,
      secondPriceDzd: 1350,
      differenceDzd: -150,
      cheaper: 'second',
      firstSupplier: 'Alpha',
      secondSupplier: 'Beta',
    })
    expect(result.onlyFirst).toEqual(['Aluminum'])
    expect(result.onlySecond).toEqual(['Steel'])
  })

  it('rejects duplicate normalized materials in a supplier quotation', () => {
    const first = analyzeMaterialsCsv('Material,Quantity,Unit,Unit Price\nPVC Board,1,piece,1500\nPVC Board,2,piece,1400')
    const second = analyzeMaterialsCsv('Material,Quantity,Unit,Unit Price\nPVC Board,1,piece,1300')
    expect(() => compareSupplierQuotes(first, second)).toThrow('MATERIAU_DUPLIQUE_DANS_DEVIS_FOURNISSEUR')
  })

})
