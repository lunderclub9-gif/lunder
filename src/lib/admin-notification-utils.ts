export type NotificationEventType = 'new_order' | 'new_custom_request'

export type AdminNotification = {
  id: string
  owner_id: string
  event_type: NotificationEventType
  event_id: string
  related_order_id: string | null
  related_request_id: string | null
  title: string
  description: string
  created_at: string
  read_at: string | null
}

export function notificationDestination(notification: Pick<AdminNotification, 'event_type' | 'related_order_id' | 'related_request_id'>): string {
  if (notification.event_type === 'new_order' && notification.related_order_id) {
    return `/admin/commandes?order=${encodeURIComponent(notification.related_order_id)}`
  }
  if (notification.event_type === 'new_custom_request' && notification.related_request_id) {
    return `/admin/demandes?request=${encodeURIComponent(notification.related_request_id)}`
  }
  return notification.event_type === 'new_order' ? '/admin/commandes' : '/admin/demandes'
}

/** Keep the PostgREST OR expression safe while preserving names, phone digits and order refs. */
export function buildOrderSearchExpression(query: string): string | null {
  const term = query.trim().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().slice(0, 100)
  if (!term) return null
  const pattern = `*${term}*`
  const clauses = [
    `order_number.ilike.${pattern}`,
    `customer_name.ilike.${pattern}`,
    `phone.ilike.${pattern}`,
  ]
  if (/^[0-9\s-]+$/.test(term)) {
    const digits = term.replace(/\D/g, '')
    if (digits.length >= 5) clauses.push(`phone.ilike.*${[...digits].join('*')}*`)
  }
  return clauses.join(',')
}
