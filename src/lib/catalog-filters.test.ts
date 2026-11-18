import { describe, expect, it } from 'vitest'
import {
  collectMaterials,
  parsePriceBucket,
  priceBucketLabel,
  priceBucketRange,
  resolveMaterial,
} from './catalog-filters'

describe('catalogue filters', () => {
  it('falls back to "all" for unknown or empty price buckets', () => {
    expect(parsePriceBucket(null)).toBe('all')
    expect(parsePriceBucket('free')).toBe('all')
    expect(parsePriceBucket('2000-5000')).toBe('2000-5000')
  })

  it('maps buckets to inclusive-exclusive numeric ranges', () => {
    expect(priceBucketRange('under-2000')).toEqual({ max: 2000 })
    expect(priceBucketRange('2000-5000')).toEqual({ min: 2000, max: 5000 })
    expect(priceBucketRange('over-10000')).toEqual({ min: 10000 })
    expect(priceBucketRange('all')).toEqual({})
    expect(priceBucketLabel('over-10000')).toBe('Plus de 10 000 DA')
  })

  it('resolves materials case-insensitively to the stored spelling', () => {
    const materials = ['PLA Noir', 'PETG', 'Résine']
    expect(resolveMaterial('pla noir', materials)).toBe('PLA Noir')
    expect(resolveMaterial('résine', materials)).toBe('Résine')
    expect(resolveMaterial('ABS', materials)).toBe('')
    expect(resolveMaterial('', materials)).toBe('')
  })

  it('collects unique materials without duplicates or blank values', () => {
    expect(collectMaterials(['PLA', 'pla', null, '  ', 'PETG', 'Résine'])).toEqual(['PETG', 'PLA', 'Résine'])
  })
})
