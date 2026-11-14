import { describe, expect, it } from 'vitest'
import { buildOrderSearchExpression, notificationDestination } from './admin-notification-utils'

describe('notificationDestination', () => {
  it('ouvre la commande précise depuis une notification de commande', () => {
    expect(notificationDestination({ event_type: 'new_order', related_order_id: 'order-123', related_request_id: null }))
      .toBe('/admin/commandes?order=order-123')
  })

  it('ouvre la demande précise depuis une notification sur mesure', () => {
    expect(notificationDestination({ event_type: 'new_custom_request', related_order_id: null, related_request_id: 'request-456' }))
      .toBe('/admin/demandes?request=request-456')
  })

  it('retombe sur la section quand la référence liée est absente', () => {
    expect(notificationDestination({ event_type: 'new_order', related_order_id: null, related_request_id: null }))
      .toBe('/admin/commandes')
  })
})

describe('buildOrderSearchExpression', () => {
  it('recherche côté serveur par référence, nom et téléphone', () => {
    expect(buildOrderSearchExpression('DEM-2026-01234')).toBe(
      'order_number.ilike.*DEM-2026-01234*,customer_name.ilike.*DEM-2026-01234*,phone.ilike.*DEM-2026-01234*'
    )
  })

  it('recherche les chiffres d’un téléphone même si la valeur stockée contient des espaces', () => {
    expect(buildOrderSearchExpression('0550123456')).toBe(
      'order_number.ilike.*0550123456*,customer_name.ilike.*0550123456*,phone.ilike.*0550123456*,phone.ilike.*0*5*5*0*1*2*3*4*5*6*'
    )
  })

  it('retire les caractères de syntaxe PostgREST et ignore les recherches vides', () => {
    expect(buildOrderSearchExpression('x,customer_name.eq.anything')).toBe(
      'order_number.ilike.*xcustomernameeqanything*,customer_name.ilike.*xcustomernameeqanything*,phone.ilike.*xcustomernameeqanything*'
    )
    expect(buildOrderSearchExpression('  ,()  ')).toBeNull()
  })
})
