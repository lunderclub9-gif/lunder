import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import {
  DELIVERY_METHOD_LABELS,
  normalizeAlgerianPhone,
  orderErrorMessage,
  orderStatusLabel,
  type TrackedOrder,
} from '@/lib/checkout'

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [order, setOrder] = useState<TrackedOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setOrder(null)

    const normalized = normalizeAlgerianPhone(phone)
    if (!normalized) {
      setError('Numéro de téléphone algérien invalide.')
      return
    }

    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('track_order', {
      p_order_number: orderNumber.trim(),
      p_phone: normalized,
    })
    setLoading(false)

    if (rpcError || !data) {
      setError(
        orderErrorMessage(rpcError?.message, 'Aucune commande ne correspond à ces informations.')
      )
      return
    }
    setOrder(data as TrackedOrder)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-offwhite">Suivre ma commande</h1>
      <p className="mt-2 text-sm text-charcoal-400">
        Saisissez votre numéro de commande et le téléphone utilisé lors de la commande.
      </p>

      <form onSubmit={handleSubmit} className="admin-card mt-6 space-y-4">
        <label className="block">
          <span className="label-text">Numéro de commande</span>
          <input
            type="text"
            required
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            className="input-field font-mono"
            placeholder="LND-2026-00001"
          />
        </label>
        <label className="block">
          <span className="label-text">Téléphone</span>
          <input
            type="tel"
            required
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="input-field"
            placeholder="0550 12 34 56"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Rechercher
        </button>
      </form>

      {order && (
        <div className="admin-card mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-sm text-offwhite">{order.order_number}</h2>
            <span className="rounded-full bg-charcoal-700 px-3 py-1 text-xs text-offwhite">
              {orderStatusLabel(order.status)}
            </span>
          </div>
          <p className="text-sm text-charcoal-300">
            {order.items_count} article{order.items_count > 1 ? 's' : ''} ·{' '}
            {formatDzd(order.total_dzd)} à la livraison
          </p>
          <p className="text-sm text-charcoal-300">
            {DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method} —{' '}
            {order.commune}, wilaya de {order.wilaya}
          </p>
          <p className="text-xs text-charcoal-500">
            Pour le détail complet, utilisez le lien reçu à la confirmation de la commande.
          </p>
        </div>
      )}
    </div>
  )
}
