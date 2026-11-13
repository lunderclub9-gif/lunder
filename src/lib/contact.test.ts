import { describe, expect, it } from 'vitest'
import { toMailtoHref, toTelHref, toWhatsAppHref } from './contact'

describe('toTelHref', () => {
  it('convertit un numéro algérien en lien tel: international', () => {
    expect(toTelHref('0550 12 34 56')).toBe('tel:+213550123456')
    expect(toTelHref('+213 661 22 33 44')).toBe('tel:+213661223344')
    expect(toTelHref('00213770112233')).toBe('tel:+213770112233')
  })

  it('ne produit aucun lien pour une valeur invalide', () => {
    expect(toTelHref('')).toBeNull()
    expect(toTelHref(null)).toBeNull()
    expect(toTelHref(undefined)).toBeNull()
    expect(toTelHref('021 23 45 67')).toBeNull()
  })
})

describe('toWhatsAppHref', () => {
  it('construit une conversation wa.me sans indicatif doublé', () => {
    expect(toWhatsAppHref('0550 12 34 56')).toBe('https://wa.me/213550123456')
    expect(toWhatsAppHref('+213550123456')).toBe('https://wa.me/213550123456')
  })

  it('encode un message pré-rempli', () => {
    expect(toWhatsAppHref('0550123456', 'Bonjour, je souhaite un devis')).toBe(
      'https://wa.me/213550123456?text=Bonjour%2C%20je%20souhaite%20un%20devis'
    )
  })

  it('refuse un numéro invalide', () => {
    expect(toWhatsAppHref('')).toBeNull()
    expect(toWhatsAppHref('12345')).toBeNull()
  })
})

describe('toMailtoHref', () => {
  it('accepte une adresse plausible', () => {
    expect(toMailtoHref('contact@lunder.dz')).toBe('mailto:contact@lunder.dz')
    expect(toMailtoHref('  studio@lunder3d.com  ')).toBe('mailto:studio@lunder3d.com')
  })

  it('refuse une adresse malformée', () => {
    expect(toMailtoHref('')).toBeNull()
    expect(toMailtoHref('contact')).toBeNull()
    expect(toMailtoHref('contact@')).toBeNull()
    expect(toMailtoHref('@lunder.dz')).toBeNull()
    expect(toMailtoHref('a b@lunder.dz')).toBeNull()
  })
})
