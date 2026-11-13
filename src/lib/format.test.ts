import { describe, expect, it } from 'vitest'
import { formatDzd, generateSku, sanitizeSearchTerm, slugify } from './format'

describe('slugify', () => {
  it('retire les accents au lieu de les supprimer avec la lettre', () => {
    expect(slugify('Tagère')).toBe('tagere')
    expect(slugify('Étagère murale')).toBe('etagere-murale')
    expect(slugify('Boîte à bijoux')).toBe('boite-a-bijoux')
  })

  it('développe les ligatures françaises', () => {
    expect(slugify('Cœur')).toBe('coeur')
    expect(slugify('Œuvre')).toBe('oeuvre')
  })

  it('ne produit jamais un slug vide', () => {
    expect(slugify('')).toBe('produit')
    expect(slugify('   ')).toBe('produit')
    expect(slugify('!!!')).toBe('produit')
  })

  it('normalise les apostrophes et les séparateurs', () => {
    expect(slugify("Lampe d'appoint")).toBe('lampe-d-appoint')
    expect(slugify('Vase  --  Grand')).toBe('vase-grand')
  })

  it('borne la longueur et ne finit pas par un tiret', () => {
    const slug = slugify('a'.repeat(200))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('sanitizeSearchTerm', () => {
  it('neutralise la syntaxe des filtres PostgREST', () => {
    expect(sanitizeSearchTerm('a,b')).toBe('a b')
    expect(sanitizeSearchTerm('name.ilike.%x%')).toBe('name ilike x')
    expect(sanitizeSearchTerm('(test)')).toBe('test')
    expect(sanitizeSearchTerm('a"b\\c')).toBe('a b c')
  })

  it('conserve les accents et les lettres arabes', () => {
    expect(sanitizeSearchTerm('Étagère')).toBe('Étagère')
    expect(sanitizeSearchTerm('طابعة')).toBe('طابعة')
  })

  it('retire les caractères de contrôle et compacte les espaces', () => {
    expect(sanitizeSearchTerm('a\u0000b\u001fc')).toBe('a b c')
    expect(sanitizeSearchTerm('  vase    grand  ')).toBe('vase grand')
  })

  it('borne la longueur demandée', () => {
    expect(sanitizeSearchTerm('x'.repeat(100)).length).toBe(60)
    expect(sanitizeSearchTerm('x'.repeat(100), 10).length).toBe(10)
  })

  it('renvoie une chaîne vide pour une saisie sans contenu exploitable', () => {
    expect(sanitizeSearchTerm('   ')).toBe('')
    expect(sanitizeSearchTerm('%%%')).toBe('')
  })
})

describe('formatDzd', () => {
  it('affiche des dinars entiers', () => {
    expect(formatDzd(0)).toBe('0 DA')
    expect(formatDzd(2500)).toMatch(/2\s?500 DA/)
  })

  it('n’affiche jamais de décimales', () => {
    expect(formatDzd(1234.56)).not.toContain(',')
    expect(formatDzd(1234.56)).toMatch(/1\s?235 DA/)
  })
})

describe('generateSku', () => {
  it('construit un préfixe à partir des initiales de la catégorie', () => {
    expect(generateSku('Impression 3D', 7)).toBe('I3-0007')
  })
})
