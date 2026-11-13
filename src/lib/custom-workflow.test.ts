import { describe, expect, it } from 'vitest'
import { canCustomerDecideCustomQuote, canOwnerApproveCustomQuote } from './custom-workflow'

const today = '2026-11-13'

function ownerApproval(overrides: Partial<Parameters<typeof canOwnerApproveCustomQuote>[0]> = {}) {
  return canOwnerApproveCustomQuote({
    requestStatus: 'quoted',
    quoteStatus: 'sent',
    validUntil: '2026-11-20',
    orderId: null,
    today,
    ...overrides,
  })
}

describe('règles du workflow sur mesure', () => {
  it('permet au propriétaire d’approuver un devis envoyé sans décision préalable du client', () => {
    expect(ownerApproval({ quoteStatus: 'sent' })).toBe(true)
  })

  it('permet aussi l’approbation d’un devis accepté par le client', () => {
    expect(ownerApproval({ quoteStatus: 'accepted' })).toBe(true)
  })

  it('refuse un devis expiré', () => {
    expect(ownerApproval({ validUntil: '2026-11-12' })).toBe(false)
  })

  it('bloque une demande rejetée, clôturée ou déjà approuvée', () => {
    for (const requestStatus of ['rejected', 'closed', 'approved']) {
      expect(ownerApproval({ requestStatus })).toBe(false)
    }
  })

  it('bloque une création si la commande existe déjà ou si le devis est terminal', () => {
    expect(ownerApproval({ orderId: 'order-1' })).toBe(false)
    expect(ownerApproval({ quoteStatus: 'rejected' })).toBe(false)
    expect(ownerApproval({ quoteStatus: 'expired' })).toBe(false)
  })

  it('autorise la décision cliente seulement sur un devis envoyé non expiré', () => {
    expect(canCustomerDecideCustomQuote({ quoteStatus: 'sent', validUntil: '2026-11-13', today })).toBe(true)
    expect(canCustomerDecideCustomQuote({ quoteStatus: 'sent', validUntil: '2026-11-12', today })).toBe(false)
    expect(canCustomerDecideCustomQuote({ quoteStatus: 'accepted', validUntil: '2026-11-20', today })).toBe(false)
  })
})
