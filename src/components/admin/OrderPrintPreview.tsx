import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import JsBarcode from 'jsbarcode'
import { MapPin, Package, Printer, Store, UserRound, X } from 'lucide-react'
import { formatDzd } from '@/lib/format'
import { DELIVERY_METHOD_LABELS, orderStatusLabel } from '@/lib/checkout'
import type { PrintFormat, ThermalWidth } from '@/lib/admin-preferences'
import {
  getMarginMm,
  getPaperDimensions,
  isThermalPaper,
  type MarginPreset,
  type PageOrientation,
  type PaperSize,
} from '@/lib/print-layout'
import { supabase } from '@/lib/supabase'

type OrderPrintData = {
  order_number: string
  status: string
  customer_name: string
  phone: string
  email: string | null
  wilaya_code?: number | null
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
    unit_price_dzd?: number
    line_total_dzd: number
  }[]
}

type StoreInformation = {
  store_name: string
  phone: string
  whatsapp: string
  email: string
  address: string
}

type LayoutChoice = 'automatic' | 'professional' | 'compact'
type PrintScale = 'fit' | 'actual'
type ColorMode = 'color' | 'monochrome'

const EMPTY_STORE_INFORMATION: StoreInformation = {
  store_name: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
}

const PAPER_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: 'a4', label: 'A4 — 210 × 297 mm' },
  { value: 'a5', label: 'A5 — 148 × 210 mm' },
  { value: 'a6', label: 'A6 — 105 × 148 mm' },
  { value: 'a3', label: 'A3 — 297 × 420 mm' },
  { value: 'letter', label: 'Letter — 216 × 279 mm' },
  { value: 'legal', label: 'Legal — 216 × 356 mm' },
  { value: 'thermal58', label: 'Thermique — 58 mm' },
  { value: 'thermal80', label: 'Thermique — 80 mm' },
  { value: 'custom', label: 'Format personnalisé' },
]

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return new Intl.DateTimeFormat('fr-DZ', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatWilayaCode(value: number | null | undefined): string | null {
  if (!Number.isInteger(value) || !value || value < 1 || value > 69) return null
  return String(value).padStart(2, '0')
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
  const defaultPaper: PaperSize = defaultFormat === 'thermal'
    ? defaultWidth === 58 ? 'thermal58' : 'thermal80'
    : 'a4'
  const [paperSize, setPaperSize] = useState<PaperSize>(defaultPaper)
  const [orientation, setOrientation] = useState<PageOrientation>('portrait')
  const [marginPreset, setMarginPreset] = useState<MarginPreset>('default')
  const [customMarginMm, setCustomMarginMm] = useState(10)
  const [customWidthMm, setCustomWidthMm] = useState(100)
  const [customHeightMm, setCustomHeightMm] = useState(150)
  const [scale, setScale] = useState<PrintScale>('fit')
  const [fitZoom, setFitZoom] = useState(1)
  const [colorMode, setColorMode] = useState<ColorMode>('color')
  const [layout, setLayout] = useState<LayoutChoice>('automatic')
  const [storeInformation, setStoreInformation] = useState(EMPTY_STORE_INFORMATION)
  const [barcodeError, setBarcodeError] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const barcodeRef = useRef<SVGSVGElement>(null)

  const thermal = isThermalPaper(paperSize)
  const dimensions = getPaperDimensions(paperSize, orientation, customWidthMm, customHeightMm)
  const marginMm = getMarginMm(paperSize, marginPreset, customMarginMm)
  const compact = layout === 'compact' || (layout === 'automatic' && (paperSize === 'a6' || thermal))
  const items = order.order_items ?? []
  const wilayaCode = formatWilayaCode(order.wilaya_code)
  const deliveryLabel = DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method
  const amountLabel = order.payment_method === 'cod' ? 'Montant à encaisser' : 'Total de la commande'

  useEffect(() => {
    let cancelled = false
    const loadStoreInformation = async () => {
      const { data, error } = await supabase
        .from('store_settings')
        .select('key, value')
        .in('key', ['store_name', 'phone', 'whatsapp', 'email', 'address'])

      if (cancelled || error || !data) return
      const values = Object.fromEntries(data.map((row) => [row.key, row.value?.trim() ?? ''])) as Partial<StoreInformation>
      setStoreInformation({ ...EMPTY_STORE_INFORMATION, ...values })
    }

    void loadStoreInformation()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!barcodeRef.current) return
    try {
      JsBarcode(barcodeRef.current, order.order_number, {
        format: 'CODE128',
        lineColor: '#111827',
        width: dimensions.widthMm <= 60 ? 0.78 : 1.12,
        height: thermal ? 36 : 44,
        displayValue: false,
        margin: 8,
        background: '#ffffff',
      })
      setBarcodeError(false)
    } catch {
      setBarcodeError(true)
    }
  }, [dimensions.widthMm, order.order_number, thermal])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (scale === 'actual') {
        setFitZoom(1)
        return
      }

      const content = contentRef.current
      if (!content) return

      const pixelsPerMillimeter = 96 / 25.4
      const availableWidth = Math.max(1, dimensions.widthMm - marginMm * 2) * pixelsPerMillimeter
      const availableHeight = dimensions.heightMm === null
        ? Number.POSITIVE_INFINITY
        : Math.max(1, dimensions.heightMm - marginMm * 2) * pixelsPerMillimeter
      const widthRatio = availableWidth / Math.max(1, content.scrollWidth)
      const heightRatio = availableHeight / Math.max(1, content.scrollHeight)
      setFitZoom(Math.min(1, widthRatio, heightRatio))
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    colorMode,
    dimensions.heightMm,
    dimensions.widthMm,
    items.length,
    layout,
    marginMm,
    order.customer_name,
    order.note,
    order.order_number,
    scale,
    storeInformation,
  ])

  useEffect(() => {
    document.body.classList.add('admin-order-printing')
    let pageStyle = document.getElementById('admin-order-print-page') as HTMLStyleElement | null
    if (!pageStyle) {
      pageStyle = document.createElement('style')
      pageStyle.id = 'admin-order-print-page'
      document.head.appendChild(pageStyle)
    }

    const setPageSize = () => {
      const printHeight = thermal
        ? Math.max(60, Math.ceil(((sheetRef.current?.scrollHeight ?? 320) * 25.4) / 96) + marginMm * 2)
        : dimensions.heightMm ?? 297
      pageStyle!.textContent = `@page { size: ${dimensions.widthMm}mm ${printHeight}mm; margin: 0; }`
    }

    setPageSize()
    window.addEventListener('beforeprint', setPageSize)
    return () => {
      window.removeEventListener('beforeprint', setPageSize)
      document.body.classList.remove('admin-order-printing')
      pageStyle?.remove()
    }
  }, [dimensions.heightMm, dimensions.widthMm, marginMm, thermal])

  const pageHeight = thermal ? undefined : `${dimensions.heightMm}mm`
  const hasSenderDetails = Boolean(
    storeInformation.phone || storeInformation.whatsapp || storeInformation.email || storeInformation.address
  )
  const paymentLabel = order.payment_method === 'cod'
    ? 'À la livraison · contre remboursement'
    : order.payment_method

  return createPortal(
    <div
      className="admin-order-print-dialog fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-order-title"
    >
      <div className="my-auto w-full max-w-6xl rounded-xl border border-charcoal-400/20 bg-charcoal-900 p-4 shadow-2xl sm:p-6">
        <div className="admin-order-print-controls mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="print-order-title" className="text-lg font-semibold text-offwhite">Aperçu du bon de livraison</h2>
            <p className="mt-1 text-xs text-charcoal-400">
              Choisissez le format ici, puis le navigateur proposera toutes les imprimantes installées.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-2" aria-label="Fermer l’aperçu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="admin-order-print-controls mb-5 grid grid-cols-1 gap-3 rounded-lg border border-charcoal-400/15 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-charcoal-200">
            <span className="label-text">Format papier</span>
            <select
              value={paperSize}
              onChange={(event) => {
                const nextSize = event.target.value as PaperSize
                setPaperSize(nextSize)
                if (isThermalPaper(nextSize)) setCustomMarginMm((current) => Math.min(current, 4))
              }}
              className="input-field py-2"
            >
              {PAPER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          {paperSize === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-charcoal-200">
                <span className="label-text">Largeur (mm)</span>
                <input type="number" min={40} max={700} value={customWidthMm} onChange={(event) => setCustomWidthMm(Number(event.target.value))} className="input-field py-2" />
              </label>
              <label className="text-sm text-charcoal-200">
                <span className="label-text">Hauteur (mm)</span>
                <input type="number" min={40} max={700} value={customHeightMm} onChange={(event) => setCustomHeightMm(Number(event.target.value))} className="input-field py-2" />
              </label>
            </div>
          )}

          <label className="text-sm text-charcoal-200">
            <span className="label-text">Orientation</span>
            <select value={orientation} onChange={(event) => setOrientation(event.target.value as PageOrientation)} disabled={thermal} className="input-field py-2 disabled:opacity-50">
              <option value="portrait">Portrait</option>
              <option value="landscape">Paysage</option>
            </select>
          </label>

          <label className="text-sm text-charcoal-200">
            <span className="label-text">Marges</span>
            <select
              value={marginPreset}
              onChange={(event) => {
                const nextPreset = event.target.value as MarginPreset
                setMarginPreset(nextPreset)
                if (thermal && nextPreset === 'custom') setCustomMarginMm((current) => Math.min(current, 4))
              }}
              className="input-field py-2"
            >
              <option value="default">Standard</option>
              <option value="narrow">Étroites</option>
              <option value="custom">Personnalisées</option>
            </select>
          </label>

          {marginPreset === 'custom' && (
            <label className="text-sm text-charcoal-200">
              <span className="label-text">Marge (mm)</span>
                <input type="number" min={0} max={thermal ? 4 : 30} step={0.5} value={customMarginMm} onChange={(event) => setCustomMarginMm(Math.min(thermal ? 4 : 30, Number(event.target.value)))} className="input-field py-2" />
            </label>
          )}

          <label className="text-sm text-charcoal-200">
            <span className="label-text">Mise en page</span>
            <select value={layout} onChange={(event) => setLayout(event.target.value as LayoutChoice)} className="input-field py-2">
              <option value="automatic">Automatique selon le papier</option>
              <option value="professional">Professionnelle</option>
              <option value="compact">Compacte</option>
            </select>
          </label>

          <label className="text-sm text-charcoal-200">
            <span className="label-text">Échelle</span>
            <select value={scale} onChange={(event) => setScale(event.target.value as PrintScale)} className="input-field py-2">
              <option value="fit">Ajuster à la page</option>
              <option value="actual">100 %</option>
            </select>
            {scale === 'fit' && fitZoom < 0.995 && (
              <span className="mt-1 block text-xs text-charcoal-400">Réduction calculée : {Math.round(fitZoom * 100)} %</span>
            )}
          </label>

          <label className="text-sm text-charcoal-200">
            <span className="label-text">Couleur</span>
            <select value={colorMode} onChange={(event) => setColorMode(event.target.value as ColorMode)} className="input-field py-2">
              <option value="color">Couleur</option>
              <option value="monochrome">Noir et blanc</option>
            </select>
          </label>

          <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="button" onClick={onClose} className="btn-secondary">Fermer</button>
            <button type="button" onClick={() => window.print()} className="btn-primary">
              <Printer className="h-4 w-4" /> Imprimer
            </button>
          </div>
        </div>

        <div className="admin-order-print-preview-scroll overflow-auto rounded-lg bg-charcoal-800/70 p-2 sm:p-5">
          <article
            ref={sheetRef}
            className={`admin-order-print-sheet mx-auto bg-white text-slate-950 shadow-lg ${thermal ? `thermal-${dimensions.widthMm}` : ''} ${compact ? 'document-compact' : ''} ${colorMode === 'monochrome' ? 'print-monochrome' : ''}`}
            style={{
              width: `${dimensions.widthMm}mm`,
              maxWidth: '100%',
              minHeight: pageHeight,
              padding: `${marginMm}mm`,
              zoom: 1,
            }}
          >
            <div ref={contentRef} className="delivery-note-content" style={{ zoom: scale === 'fit' ? fitZoom : 1 }}>
            <div className="delivery-note-topline" aria-hidden="true" />
            <header className="delivery-note-header">
              <div className="delivery-note-brand">
                <svg className="delivery-note-mark" viewBox="0 0 48 48" role="img" aria-label="Symbole LUNDER 3D">
                  <path d="M24 3 43 14v20L24 45 5 34V14L24 3Z" fill="#fff" stroke="#dc2626" strokeWidth="3" />
                  <path d="m24 3 0 21m19-10L24 24 5 14m19 10v21m0-21 19 10M24 24 5 34" fill="none" stroke="#dc2626" strokeWidth="2" />
                  <path d="m24 3 19 11-19 10V3Z" fill="#dc2626" opacity=".12" />
                </svg>
                <div>
                  <p className="delivery-note-wordmark">LUNDER <span>3D</span></p>
                  <p className="delivery-note-brand-caption">IMPRESSION · CRÉATION · LIVRAISON</p>
                </div>
              </div>
              <div className="delivery-note-title-block">
                <p className="delivery-note-kicker">DOCUMENT D’EXPÉDITION</p>
                <h1>BON DE LIVRAISON</h1>
                <p className="delivery-note-issued">Créé le {formatDate(order.created_at)}</p>
              </div>
            </header>

            <section className="delivery-note-reference-row" aria-label="Identification de commande">
              <div className="delivery-note-reference">
                <span className="delivery-note-label">RÉFÉRENCE COMMANDE</span>
                <strong>{order.order_number}</strong>
                <span className="delivery-note-small">Référence interne LUNDER 3D — pas un numéro de suivi transporteur</span>
              </div>
              {wilayaCode && (
                <div className="delivery-note-wilaya-badge" aria-label={`Wilaya ${wilayaCode}`}>
                  <span>WILAYA</span>
                  <strong>{wilayaCode}</strong>
                  <small>{order.wilaya_name}</small>
                </div>
              )}
            </section>

            <div className="delivery-note-parties">
              <section className="delivery-note-panel" aria-labelledby="delivery-sender-title">
                <h2 id="delivery-sender-title"><Store aria-hidden="true" /> EXPÉDITEUR</h2>
                <p className="delivery-note-person-name">{storeInformation.store_name || 'LUNDER 3D'}</p>
                {storeInformation.address && <p>{storeInformation.address}</p>}
                {storeInformation.phone && <p>Tél. {storeInformation.phone}</p>}
                {storeInformation.whatsapp && storeInformation.whatsapp !== storeInformation.phone && <p>WhatsApp {storeInformation.whatsapp}</p>}
                {storeInformation.email && <p>{storeInformation.email}</p>}
                {!hasSenderDetails && <p className="delivery-note-muted">Coordonnées de la boutique non renseignées</p>}
              </section>

              <section className="delivery-note-panel delivery-note-recipient" aria-labelledby="delivery-recipient-title">
                <h2 id="delivery-recipient-title"><UserRound aria-hidden="true" /> DESTINATAIRE</h2>
                <p className="delivery-note-person-name">{order.customer_name}</p>
                <p>{order.phone}</p>
                {order.email && <p>{order.email}</p>}
                <p className="delivery-note-location"><MapPin aria-hidden="true" /> {order.commune_name}, {order.wilaya_name}</p>
                {order.address && <p className="delivery-note-address">{order.address}</p>}
                {order.pickup_point_snapshot && <p className="delivery-note-address"><strong>Point relais :</strong> {order.pickup_point_snapshot}</p>}
              </section>
            </div>

            <section className="delivery-note-shipping-row" aria-label="Mode de livraison">
              <div><span className="delivery-note-label">MODE DE LIVRAISON</span><strong>{deliveryLabel}</strong></div>
              <div><span className="delivery-note-label">STATUT</span><strong>{orderStatusLabel(order.status)}</strong></div>
            </section>

            <section className="delivery-note-items" aria-labelledby="delivery-items-title">
              <h2 id="delivery-items-title"><Package aria-hidden="true" /> ARTICLES À LIVRER</h2>
              <table>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th className="delivery-note-quantity">Qté</th>
                    {!compact && <th className="delivery-note-money">P.U.</th>}
                    <th className="delivery-note-money">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const unitPrice = item.unit_price_dzd ?? (item.quantity > 0 ? item.line_total_dzd / item.quantity : null)
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.product_name}</strong>
                          {item.variant_label && <span className="delivery-note-variant">{item.variant_label}</span>}
                          {compact && unitPrice !== null && <span className="delivery-note-unit">Unité : {formatDzd(unitPrice)}</span>}
                        </td>
                        <td className="delivery-note-quantity">{item.quantity}</td>
                        {!compact && <td className="delivery-note-money">{unitPrice === null ? '—' : formatDzd(unitPrice)}</td>}
                        <td className="delivery-note-money">{formatDzd(item.line_total_dzd)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>

            <section className="delivery-note-totals" aria-label="Récapitulatif des montants">
              <div><span>Sous-total articles</span><strong>{formatDzd(order.subtotal_dzd)}</strong></div>
              <div><span>Frais de livraison</span><strong>{formatDzd(order.delivery_dzd)}</strong></div>
              <div className="delivery-note-total"><span>TOTAL COMMANDE</span><strong>{formatDzd(order.total_dzd)}</strong></div>
              {order.payment_method === 'cod' && (
                <div className="delivery-note-collect"><span>À ENCAISSER À LA LIVRAISON</span><strong>{formatDzd(order.total_dzd)}</strong></div>
              )}
            </section>

            <section className="delivery-note-bottom-grid">
              <div className="delivery-note-barcode-block">
                <span className="delivery-note-label">CODE-BARRES · CODE 128</span>
                <svg ref={barcodeRef} className="delivery-note-barcode" data-value={order.order_number} role="img" aria-label={`Code-barres de la référence commande ${order.order_number}`} />
                {barcodeError ? <span className="delivery-note-muted">Code-barres indisponible pour cette référence.</span> : <span className="delivery-note-barcode-value">{order.order_number}</span>}
              </div>
              <div className="delivery-note-payment">
                <span className="delivery-note-label">PAIEMENT</span>
                <strong>{paymentLabel}</strong>
                <span className="delivery-note-small">{amountLabel} : {formatDzd(order.total_dzd)}</span>
              </div>
            </section>

            {order.note && (
              <section className="delivery-note-note">
                <strong>NOTE DE COMMANDE</strong>
                <p>{order.note}</p>
              </section>
            )}

            <footer className="delivery-note-footer">
              <div className="delivery-note-signature"><span>Signature du destinataire</span><i /></div>
              <div className="delivery-note-signature"><span>Date de réception</span><i /></div>
              <div className="delivery-note-footer-brand"><span>LUNDER 3D</span><small>Merci pour votre confiance.</small></div>
            </footer>
            </div>
          </article>
        </div>
      </div>
    </div>,
    document.body,
  )
}
