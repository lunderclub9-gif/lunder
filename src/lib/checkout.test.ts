import { describe, expect, it } from 'vitest'
import {
  DELIVERY_METHOD_LABELS,
  normalizeAlgerianPhone,
  orderErrorMessage,
  orderStatusLabel,
} from './checkout'

describe('normalizeAlgerianPhone', () => {
  it('accepte les numéros mobiles nationaux avec séparateurs', () => {
    expect(normalizeAlgerianPhone('0550 12 34 56')).toBe('0550123456')
    expect(normalizeAlgerianPhone('0661-22-33-44')).toBe('0661223344')
    expect(normalizeAlgerianPhone('0770.11.22.33')).toBe('0770112233')
  })

  it('accepte le format international', () => {
    expect(normalizeAlgerianPhone('+213 550 12 34 56')).toBe('0550123456')
    expect(normalizeAlgerianPhone('00213550123456')).toBe('0550123456')
    expect(normalizeAlgerianPhone('213550123456')).toBe('0550123456')
  })

  it('accepte un numéro saisi sans le zéro initial', () => {
    expect(normalizeAlgerianPhone('550123456')).toBe('0550123456')
  })

  it('refuse les fixes, les longueurs fausses et les préfixes inconnus', () => {
    expect(normalizeAlgerianPhone('021 23 45 67')).toBeNull()
    expect(normalizeAlgerianPhone('0550123')).toBeNull()
    expect(normalizeAlgerianPhone('05501234567')).toBeNull()
    expect(normalizeAlgerianPhone('')).toBeNull()
    expect(normalizeAlgerianPhone('numéro')).toBeNull()
  })
})

describe('orderErrorMessage', () => {
  it('traduit les codes métier en français', () => {
    expect(orderErrorMessage('STOCK_INSUFFISANT', 'Erreur')).toContain('Stock insuffisant')
    expect(orderErrorMessage('LIVRAISON_INDISPONIBLE', 'Erreur')).toContain('livraison')
  })

  it('retourne le message de repli pour un code inconnu ou absent', () => {
    expect(orderErrorMessage('AUTRE_CHOSE', 'Erreur de secours')).toBe('Erreur de secours')
    expect(orderErrorMessage(null, 'Erreur de secours')).toBe('Erreur de secours')
    expect(orderErrorMessage(undefined, 'Erreur de secours')).toBe('Erreur de secours')
  })
})

describe('labels', () => {
  it('connaît les statuts de commande', () => {
    expect(orderStatusLabel('pending')).toBe('En attente de confirmation')
    expect(orderStatusLabel('delivered')).toBe('Livrée')
  })

  it('retourne le statut brut plutôt que « undefined »', () => {
    expect(orderStatusLabel('inconnu')).toBe('inconnu')
  })

  it('connaît les modes de livraison', () => {
    expect(DELIVERY_METHOD_LABELS.domicile).toBe('Livraison à domicile')
    expect(DELIVERY_METHOD_LABELS.stopdesk).toBe('Point relais / Stop Desk')
  })
})
