import { describe, expect, it } from 'vitest'
import { safeExternalUrl } from './url'

describe('safeExternalUrl', () => {
  it('accepte les URL http(s) absolues', () => {
    expect(safeExternalUrl('https://instagram.com/lunder')).toBe('https://instagram.com/lunder')
    expect(safeExternalUrl('  http://example.dz  ')).toBe('http://example.dz/')
  })

  it('refuse les schémas dangereux', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('refuse les valeurs vides ou non absolues', () => {
    expect(safeExternalUrl('')).toBeNull()
    expect(safeExternalUrl('   ')).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
    expect(safeExternalUrl('instagram.com/lunder')).toBeNull()
  })
})
