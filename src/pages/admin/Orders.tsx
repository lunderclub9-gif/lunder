import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, Package, Printer, Search, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { buildOrderSearchExpression } from '@/lib/admin-notification-utils'
import { useAuth } from '@/lib/auth'
import { readAdminPreferences, type AdminPreferences } from '@/lib/admin-preferences'
import OrderPrintPreview from '@/components/admin/OrderPrintPreview'
import {
  DELIVERY_METHOD_LABELS,
  orderErrorMessage,
  orderStatusLabel,
} from '@/lib/checkout'

type OrderRow = {
  id: string
  order_number: string
  status: string
  source: string
  archived_at: string | null
  customer_name: string
  phone: string
  email: string | null
  wilaya_name: string
  commune_name: string
  delivery_method: string
  payment_method: string
  subtotal_dzd: number
  delivery_dzd: number
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
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [printOrder, setPrintOrder] = useState<OrderRow | null>(null)
  const [printPreferences, setPrintPreferences] = useState<AdminPreferences>(() => readAdminPreferences(profile?.id ?? null))
  const requestSequence = useRef(0)
  const handledOrderId = useRef<string | null>(null)

  useEffect(() => {
    setPrintPreferences(readAdminPreferences(profile?.id ?? null))
  }, [profile?.id])

  const load = useCallback(async (term: string) => {
    const sequence = ++requestSequence.current
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(200)
    const expression = buildOrderSearchExpression(term)
    if (expression) query = query.or(expression)
    const { data, error: queryError } = await query
    if (sequence !== requestSequence.current) return
    if (queryError) {
      setError('Impossible de charger les commandes.')
    } else {
      setError(null)
      setOrders((data as OrderRow[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(searchText), 250)
    return () => window.clearTimeout(timer)
  }, [load, searchText])

  const requestedOrderId = searchParams.get('order')
  useEffect(() => {
    if (!requestedOrderId || loading || handledOrderId.current === requestedOrderId) return
    const existing = orders.find((order) => order.id === requestedOrderId)
    handledOrderId.current = requestedOrderId
    if (existing) {
      setExpanded(existing.id)
      return
    }

    void supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', requestedOrderId)
      .maybeSingle()
      .then(({ data, error: targetError }) => {
        if (new URLSearchParams(window.location.search).get('order') !== requestedOrderId) return
        if (targetError || !data) {
          setError('La commande liée à cette notification est introuvable ou n’est plus accessible.')
          return
        }
        const target = data as OrderRow
        setOrders((current) => [target, ...current.filter((item) => item.id !== target.id)])
        setExpanded(target.id)
      })
  }, [loading, orders, requestedOrderId])

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
    await load(searchText)
  }

  const handleDelete = async (order: OrderRow) => {
    setDeleteError(null)
    if (!confirm(`Archiver la commande ${order.order_number} ? Elle restera consultable dans les archives.`)) return
    setDeletingId(order.id)
    const { error: rpcError } = await supabase.rpc('delete_order', {
      p_order_id: order.id,
      p_reason: 'Suppression demandée depuis l\'interface',
    })
    setDeletingId(null)
    if (rpcError) {
      setDeleteError(orderErrorMessage(rpcError.message, 'Impossible d\'archiver cette commande.'))
      return
    }
    setDeleteError(null)
    await load(searchText)
  }

  const hardDelete = async (order: OrderRow) => {
    setDeleteError(null)
    if (
      !confirm(
        `Supprimer DÉFINITIVEMENT la commande ${order.order_number} ?\n\nCette action est irréversible et supprime aussi ses articles, son historique et ses fichiers. Seule une trace d'audit est conservée.`
      )
    ) {
      return
    }
    setDeletingId(order.id)
    const { error: rpcError } = await supabase.rpc('delete_delivered_order', {
      p_order_id: order.id,
      p_reason: 'Suppression définitive demandée depuis l\'interface propriétaire',
    })
    setDeletingId(null)
    if (rpcError) {
      setDeleteError(
        orderErrorMessage(rpcError.message, 'Impossible de supprimer définitivement cette commande.')
      )
      return
    }
    await load(searchText)
  }

  const visible = (filter ? orders.filter((order) => order.status === filter) : orders).filter(
    (order) => showArchived || !order.archived_at
  )

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-offwhite">Commandes</h1>
        <label className="flex items-center gap-2 text-xs text-charcoal-300">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="h-4 w-4 accent-brand-red"
          />
          Afficher les archives
        </label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="input-field sm:w-56">
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="confirmed">Confirmées</option>
          <option value="shipped">Expédiées</option>
          <option value="delivered">Livrées</option>
          <option value="cancelled">Annulées</option>
        </select>
      </div>

      <label className="relative mb-6 block max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="input-field pl-10"
          placeholder="Rechercher par référence, nom ou téléphone…"
          aria-label="Rechercher une commande par référence, nom ou téléphone"
        />
      </label>

      {error && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}
      {deleteError && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {deleteError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-card py-16 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">{searchText.trim() ? 'Aucune commande ne correspond à la recherche.' : 'Aucune commande pour le moment.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((order) => {
            const open = expanded === order.id
            return (
              <div key={order.id} className="admin-card">
                <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : order.id)}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
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
                    {order.source === 'custom' && (
                      <span className="rounded-full bg-brand-red/20 px-3 py-1 text-xs text-brand-red-light">
                        Sur mesure
                      </span>
                    )}
                    {order.archived_at && (
                      <span className="rounded-full bg-charcoal-600 px-3 py-1 text-xs text-charcoal-300">
                        Archivée
                      </span>
                    )}
                    <span className="text-sm font-semibold text-offwhite">
                      {formatDzd(order.total_dzd)}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-charcoal-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {order.status === 'delivered' && !order.archived_at && (
                  <button
                    type="button"
                    disabled={deletingId === order.id}
                    onClick={() => hardDelete(order)}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-brand-red/40 px-3 py-2 text-xs font-medium text-brand-red-light transition-colors hover:bg-brand-red/10 disabled:opacity-50"
                    title={`Supprimer définitivement ${order.order_number}`}
                  >
                    {deletingId === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Supprimer
                  </button>
                )}
                </div>

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

                    <button type="button" onClick={() => setPrintOrder(order)} className="btn-secondary">
                      <Printer className="h-4 w-4" />
                      Aperçu et impression
                    </button>

                    {!order.archived_at && order.status !== 'delivered' && order.status !== 'shipped' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={deletingId === order.id}
                          onClick={() => handleDelete(order)}
                          className="btn-secondary text-brand-red-light"
                        >
                          {deletingId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {printOrder && (
        <OrderPrintPreview
          key={printOrder.id}
          order={printOrder}
          defaultFormat={printPreferences.defaultPrintFormat}
          defaultWidth={printPreferences.thermalWidth}
          onClose={() => setPrintOrder(null)}
        />
      )}
    </div>
  )
}
