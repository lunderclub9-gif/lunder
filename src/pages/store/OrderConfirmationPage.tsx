import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Download, Loader2, MapPin, Package, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import {
  DELIVERY_METHOD_LABELS,
  orderErrorMessage,
  orderStatusLabel,
  type OrderDetail,
} from '@/lib/checkout'

export default function OrderConfirmationPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const barcodeRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!token) {
      setError('Lien de confirmation incomplet.')
      setLoading(false)
      return
    }
    supabase.rpc('get_order_by_token', { p_token: token }).then(({ data, error: rpcError }) => {
      if (rpcError || !data) {
        setError(orderErrorMessage(rpcError?.message, 'Commande introuvable.'))
      } else {
        setOrder(data as OrderDetail)
      }
      setLoading(false)
    })
  }, [token])

  useEffect(() => {
    if (!order || !barcodeRef.current) return
    try {
      JsBarcode(barcodeRef.current, order.order_number, {
        format: 'CODE128',
        lineColor: '#111827',
        width: 1.4,
        height: 48,
        displayValue: false,
        margin: 4,
        background: '#ffffff',
      })
    } catch {
      barcodeRef.current.innerHTML = ''
    }
  }, [order])

  const printTicket = () => window.print()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
        <h1 className="text-xl font-semibold text-offwhite">Commande introuvable</h1>
        <p className="mt-2 text-sm text-charcoal-400">{error}</p>
        <Link to="/boutique/suivi" className="btn-primary mt-6">
          Suivre une commande
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .customer-order-ticket, .customer-order-ticket * { visibility: visible !important; }
          .customer-order-ticket { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: 1px solid #d1d5db !important; background: #fff !important; color: #111827 !important; }
          .customer-order-ticket button, .customer-order-ticket a { display: none !important; }
        }
      `}</style>
      <div className="customer-order-ticket mb-6 rounded-xl border border-charcoal-400/20 bg-white p-5 text-slate-900 shadow-sm">
        <div className="text-center">
          <p className="text-lg font-black tracking-widest">LUNDER 3D</p>
          <p className="mt-1 text-xs text-slate-500">TICKET DE COMMANDE</p>
          <p className="mt-3 text-sm font-semibold text-green-700">Commande bien enregistrée</p>
        </div>
        <div className="my-4 border-t border-dashed border-slate-300" />
        <p className="text-xs text-slate-500">NUMÉRO DE COMMANDE</p>
        <p className="mt-1 break-all font-mono text-2xl font-bold">{order.order_number}</p>
        <p className="mt-3 text-xs text-slate-500">TÉLÉPHONE</p>
        <p className="mt-1 text-lg font-semibold">{order.phone}</p>
        <div className="mt-4 flex justify-center rounded-lg bg-white p-2">
          <svg ref={barcodeRef} role="img" aria-label={`Code-barres de la commande ${order.order_number}`} />
        </div>
        <p className="text-center font-mono text-xs text-slate-500">{order.order_number}</p>
        <div className="mt-4 rounded-lg bg-slate-100 p-3 text-center">
          <p className="text-xs text-slate-500">STATUT ACTUEL</p>
          <p className="mt-1 font-semibold">{orderStatusLabel(order.status)}</p>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Gardez ce ticket pour retrouver et suivre votre commande.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={printTicket} className="btn-primary"><Download className="h-4 w-4" /> Télécharger PDF / Imprimer</button>
          <Link to="/boutique/suivi" className="btn-secondary">Suivre ma commande</Link>
        </div>
      </div>

      <div className="mb-6 flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold text-offwhite">Merci, votre commande est enregistrée.</h1>
          <p className="mt-1 text-sm text-charcoal-300">
            Numéro de commande :{' '}
            <span className="font-mono text-offwhite">{order.order_number}</span>
          </p>
          <p className="text-sm text-charcoal-300">
            Statut : {orderStatusLabel(order.status)} · Paiement à la livraison
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="admin-card">
          <h2 className="mb-3 text-lg font-semibold text-offwhite">Articles</h2>
          <ul className="space-y-2 text-sm">
            {order.items.map((item, index) => (
              <li key={`${item.sku ?? item.product_name}-${index}`} className="flex justify-between gap-3">
                <span className="text-charcoal-300">
                  {item.quantity} × {item.product_name}
                  {item.variant_label ? ` (${item.variant_label})` : ''}
                </span>
                <span className="whitespace-nowrap text-offwhite">{formatDzd(item.line_total_dzd)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-charcoal-400/15 pt-3 text-sm">
            <div className="flex justify-between text-charcoal-300">
              <span>Sous-total</span>
              <span>{formatDzd(order.subtotal_dzd)}</span>
            </div>
            <div className="flex justify-between text-charcoal-300">
              <span>Livraison</span>
              <span>{formatDzd(order.delivery_dzd)}</span>
            </div>
            <div className="flex justify-between pt-1 text-base font-semibold text-offwhite">
              <span>Total à payer à la livraison</span>
              <span>{formatDzd(order.total_dzd)}</span>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-offwhite">
            <MapPin className="h-4 w-4 text-brand-red" />
            Livraison
          </h2>
          <p className="text-sm text-charcoal-300">
            {order.customer_name} · {order.phone}
          </p>
          <p className="mt-1 text-sm text-charcoal-300">
            {DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method} —{' '}
            {order.commune}, wilaya de {order.wilaya}
          </p>
          {order.address && <p className="mt-1 text-sm text-charcoal-300">{order.address}</p>}
          {order.pickup_point && (
            <p className="mt-1 text-sm text-charcoal-300">Point relais : {order.pickup_point}</p>
          )}
          {order.delivery_carrier && (
            <p className="mt-1 text-xs text-charcoal-400">Transporteur : {order.delivery_carrier}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/boutique/produits" className="btn-secondary">
            Continuer mes achats
          </Link>
          <Link to="/boutique/suivi" className="btn-ghost">
            Suivre ma commande
          </Link>
        </div>

        <p className="text-xs text-charcoal-500">
          Conservez ce lien : il contient votre code de suivi confidentiel. Il vous permet de
          retrouver votre commande sans compte.
        </p>
      </div>
    </div>
  )
}
