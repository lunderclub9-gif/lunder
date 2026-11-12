import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import {
  DELIVERY_METHOD_LABELS,
  orderErrorMessage,
  orderStatusLabel,
} from '@/lib/checkout'

type OrderRow = {
  id: string
  order_number: string
  status: string
  customer_name: string
  phone: string
  wilaya_name: string
  commune_name: string
  delivery_method: string
  total_dzd: number
  created_at: string
  address: string | null
  pickup_point_snapshot: string | null
  note: string | null
  order_items: { id: string; product_name: string; variant_label: string | null; quantity: number; line_total_dzd: number }[]
}

const NEXT_ACTIONS: Record<string, { status: string; label: string; danger?: boolean }[]> = {
  pending: [
    { status: 'confirmed', label: 'Confirmer' },
    { status: 'cancelled', label: 'Annuler', danger: true },
  ],
  confirmed: [
    { status: 'shipped', label: 'Marquer expédiée' },
    { status: 'cancelled', label: 'Annuler', danger: true },
  ],
  shipped: [{ status: 'delivered', label: 'Marquer livrée' }],
  delivered: [],
  cancelled: [],
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (queryError) {
      setError('Impossible de charger les commandes.')
    } else {
      setOrders((data as OrderRow[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (orderId: string, status: string) => {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('set_order_status', {
      p_order_id: orderId,
      p_status: status,
    })
    setBusy(false)
    if (rpcError) {
      setError(orderErrorMessage(rpcError.message, 'Impossible de modifier le statut.'))
      return
    }
    await load()
  }

  const visible = filter ? orders.filter((order) => order.status === filter) : orders

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-offwhite">Commandes</h1>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="input-field sm:w-56">
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="confirmed">Confirmées</option>
          <option value="shipped">Expédiées</option>
          <option value="delivered">Livrées</option>
          <option value="cancelled">Annulées</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-card py-16 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">Aucune commande pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((order) => {
            const open = expanded === order.id
            return (
              <div key={order.id} className="admin-card">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : order.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                  aria-expanded={open}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-offwhite">{order.order_number}</p>
                    <p className="mt-1 text-xs text-charcoal-400">
                      {order.customer_name} · {order.phone} · {order.commune_name}, {order.wilaya_name}
                    </p>
                    <p className="mt-1 text-xs text-charcoal-500">
                      {new Date(order.created_at).toLocaleDateString('fr-DZ')} ·{' '}
                      {order.order_items?.length ?? 0} article(s)
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span className="rounded-full bg-charcoal-700 px-3 py-1 text-xs text-offwhite">
                      {orderStatusLabel(order.status)}
                    </span>
                    <span className="text-sm font-semibold text-offwhite">
                      {formatDzd(order.total_dzd)}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-charcoal-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {open && (
                  <div className="mt-4 space-y-4 border-t border-charcoal-400/15 pt-4">
                    <ul className="space-y-1 text-sm">
                      {(order.order_items ?? []).map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 text-charcoal-300">
                          <span>
                            {item.quantity} × {item.product_name}
                            {item.variant_label ? ` (${item.variant_label})` : ''}
                          </span>
                          <span>{formatDzd(item.line_total_dzd)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="text-sm text-charcoal-300">
                      <p>
                        {DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method} —{' '}
                        {order.commune_name}, {order.wilaya_name}
                      </p>
                      {order.address && <p className="mt-1">{order.address}</p>}
                      {order.pickup_point_snapshot && (
                        <p className="mt-1">Point relais : {order.pickup_point_snapshot}</p>
                      )}
                      {order.note && <p className="mt-1 text-charcoal-400">Note : {order.note}</p>}
                    </div>

                    {(NEXT_ACTIONS[order.status] ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(NEXT_ACTIONS[order.status] ?? []).map((action) => (
                          <button
                            key={action.status}
                            type="button"
                            disabled={busy}
                            onClick={() => changeStatus(order.id, action.status)}
                            className={action.danger ? 'btn-secondary' : 'btn-primary'}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
