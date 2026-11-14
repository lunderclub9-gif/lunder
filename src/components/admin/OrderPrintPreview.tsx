import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { formatDzd } from '@/lib/format'
import { DELIVERY_METHOD_LABELS, orderStatusLabel } from '@/lib/checkout'
import type { PrintFormat, ThermalWidth } from '@/lib/admin-preferences'

type OrderPrintData = {
  order_number: string
  status: string
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
  order_items: {
    id: string
    product_name: string
    variant_label: string | null
    quantity: number
    line_total_dzd: number
  }[]
}

export default function OrderPrintPreview({
  order,
  defaultFormat,
  defaultWidth,
  onClose,
}: {
  order: OrderPrintData
  defaultFormat: PrintFormat
  defaultWidth: ThermalWidth
  onClose: () => void
}) {
  const [format, setFormat] = useState<PrintFormat>(defaultFormat)
  const [width, setWidth] = useState<ThermalWidth>(defaultWidth)
  const sheetRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.body.classList.add('admin-order-printing')
    let pageStyle = document.getElementById('admin-order-print-page') as HTMLStyleElement | null
    if (!pageStyle) {
      pageStyle = document.createElement('style')
      pageStyle.id = 'admin-order-print-page'
      document.head.appendChild(pageStyle)
    }
    const setPageSize = () => {
      if (format === 'a4') {
        pageStyle!.textContent = '@page { size: A4 portrait; margin: 12mm; }'
        return
      }
      const contentHeightPx = sheetRef.current?.scrollHeight ?? 140
      const contentHeightMm = Math.max(40, Math.ceil(contentHeightPx * 25.4 / 96 + 3))
      pageStyle!.textContent = `@page { size: ${width}mm ${contentHeightMm}mm; margin: 1mm; }`
    }
    pageStyle.textContent = format === 'a4'
      ? '@page { size: A4 portrait; margin: 12mm; }'
      : `@page { size: ${width}mm 100mm; margin: 1mm; }`
    window.addEventListener('beforeprint', setPageSize)

    return () => {
      window.removeEventListener('beforeprint', setPageSize)
      document.body.classList.remove('admin-order-printing')
      pageStyle?.remove()
    }
  }, [format, width])

  const items = order.order_items ?? []
  const thermalClass = format === 'thermal' ? `thermal-${width}` : ''

  return createPortal(
    <div className="admin-order-print-dialog fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="print-order-title">
      <div className="my-auto w-full max-w-4xl rounded-xl border border-charcoal-400/20 bg-charcoal-900 p-4 shadow-2xl sm:p-6">
        <div className="admin-order-print-controls mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="print-order-title" className="text-lg font-semibold text-offwhite">Aperçu avant impression</h2>
            <p className="mt-1 text-xs text-charcoal-400">L’impression s’ouvrira dans la boîte de dialogue du navigateur; aucune impression silencieuse.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-2" aria-label="Fermer l’aperçu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="admin-order-print-controls mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-charcoal-400/15 p-3">
          <fieldset>
            <legend className="label-text">Format</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-charcoal-200">
                <input type="radio" name="order-print-format" checked={format === 'a4'} onChange={() => setFormat('a4')} className="accent-brand-red" /> A4
              </label>
              <label className="flex items-center gap-2 text-sm text-charcoal-200">
                <input type="radio" name="order-print-format" checked={format === 'thermal'} onChange={() => setFormat('thermal')} className="accent-brand-red" /> Thermique
              </label>
            </div>
          </fieldset>
          {format === 'thermal' && (
            <fieldset>
              <legend className="label-text">Largeur du rouleau</legend>
              <div className="flex gap-4">
                {([58, 80] as const).map((size) => (
                  <label key={size} className="flex items-center gap-2 text-sm text-charcoal-200">
                    <input type="radio" name="order-print-width" checked={width === size} onChange={() => setWidth(size)} className="accent-brand-red" /> {size} mm
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button type="button" onClick={() => window.print()} className="btn-primary ml-auto">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>

        <article ref={sheetRef} className={`admin-order-print-sheet ${thermalClass} mx-auto bg-white p-6 text-black shadow-lg ${format === 'thermal' ? 'max-w-[calc(100vw-3rem)]' : 'max-w-[210mm]'}`}>
          <header className="border-b-2 border-black pb-4 text-center">
            <p className="text-xs font-bold tracking-[0.24em]">LUNDER’S 3D</p>
            <h1 className="mt-2 text-2xl font-extrabold">BON DE COMMANDE</h1>
            <p className="mt-1 font-mono text-lg font-bold">{order.order_number}</p>
            <p className="mt-1 text-sm">Émise le {new Date(order.created_at).toLocaleString('fr-DZ')}</p>
          </header>

          <section className="my-5 grid grid-cols-2 gap-5 text-sm">
            <div>
              <h2 className="mb-2 border-b border-black pb-1 text-xs font-bold uppercase tracking-wider">Client</h2>
              <p className="font-semibold">{order.customer_name}</p>
              <p>{order.phone}</p>
              {order.email && <p>{order.email}</p>}
            </div>
            <div>
              <h2 className="mb-2 border-b border-black pb-1 text-xs font-bold uppercase tracking-wider">Livraison</h2>
              <p>{DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method}</p>
              <p>{order.commune_name}, {order.wilaya_name}</p>
              {order.address && <p>{order.address}</p>}
              {order.pickup_point_snapshot && <p>Point relais : {order.pickup_point_snapshot}</p>}
            </div>
          </section>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-black text-left">
                <th className="py-2 pr-2">Article</th>
                <th className="px-2 py-2 text-center">Qté</th>
                <th className="py-2 pl-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-black/20 align-top">
                  <td className="py-2 pr-2">
                    <span className="font-medium">{item.product_name}</span>
                    {item.variant_label && <span className="block text-xs">{item.variant_label}</span>}
                  </td>
                  <td className="px-2 py-2 text-center">{item.quantity}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{formatDzd(item.line_total_dzd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-3 text-right">Articles</td>
                <td className="pt-3 text-right whitespace-nowrap">{formatDzd(order.subtotal_dzd)}</td>
              </tr>
              {order.delivery_dzd > 0 && (
                <tr>
                  <td colSpan={2} className="pt-1 text-right">Livraison</td>
                  <td className="pt-1 text-right whitespace-nowrap">{formatDzd(order.delivery_dzd)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-black text-base font-extrabold">
                <td colSpan={2} className="pt-2 text-right">TOTAL</td>
                <td className="pt-2 text-right whitespace-nowrap">{formatDzd(order.total_dzd)}</td>
              </tr>
            </tfoot>
          </table>

          <section className="mt-5 flex flex-wrap justify-between gap-3 border-t border-black pt-3 text-xs">
            <p>Statut : <strong>{orderStatusLabel(order.status)}</strong></p>
              <p>Paiement : {order.payment_method === 'cod' ? 'à la livraison' : order.payment_method}</p>
          </section>
          {order.note && (
            <section className="mt-4 border-t border-black/30 pt-3 text-sm">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wider">Note de commande</h2>
              <p className="whitespace-pre-wrap">{order.note}</p>
            </section>
          )}
          <footer className="mt-8 border-t border-black/30 pt-3 text-center text-xs">
            Merci pour votre commande · LUNDER’S 3D
          </footer>
        </article>
      </div>
    </div>,
    document.body
  )
}
