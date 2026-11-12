import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2, ShoppingBag, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCart } from '@/lib/cart'
import { formatDzd } from '@/lib/format'
import {
  DELIVERY_METHOD_LABELS,
  normalizeAlgerianPhone,
  orderErrorMessage,
  type CreatedOrder,
  type DeliveryQuote,
} from '@/lib/checkout'

type Wilaya = { code: number; name_fr: string }
type Commune = { id: string; name_fr: string }
type PickupPoint = { id: string; name: string; address: string | null }
type Method = 'domicile' | 'stopdesk'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, subtotal, clear } = useCart()

  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [wilayaCode, setWilayaCode] = useState('')
  const [communeId, setCommuneId] = useState('')
  const [method, setMethod] = useState<Method>('domicile')
  const [address, setAddress] = useState('')
  const [pickupId, setPickupId] = useState('')
  const [note, setNote] = useState('')
  const [terms, setTerms] = useState(false)

  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Conservée pendant toute la saisie : un double clic ou un nouvel essai ne crée
  // qu'une seule commande côté serveur.
  const idempotencyKey = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )

  useEffect(() => {
    supabase
      .from('wilayas')
      .select('code, name_fr')
      .eq('is_active', true)
      .order('code')
      .then(({ data }) => setWilayas((data as Wilaya[]) ?? []))
  }, [])

  useEffect(() => {
    setCommunes([])
    setCommuneId('')
    setPickupPoints([])
    setPickupId('')
    if (!wilayaCode) return

    supabase
      .from('communes')
      .select('id, name_fr')
      .eq('wilaya_code', Number(wilayaCode))
      .eq('is_active', true)
      .order('name_fr')
      .then(({ data }) => setCommunes((data as Commune[]) ?? []))

    supabase
      .from('pickup_points')
      .select('id, name, address')
      .eq('wilaya_code', Number(wilayaCode))
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setPickupPoints((data as PickupPoint[]) ?? []))
  }, [wilayaCode])

  // Devis de livraison : la seule source de prix autorisée.
  useEffect(() => {
    setQuote(null)
    setQuoteError(null)
    if (!wilayaCode || !communeId || items.length === 0) return

    let cancelled = false
    supabase
      .rpc('quote_delivery', {
        p_wilaya_code: Number(wilayaCode),
        p_commune_id: communeId,
        p_method: method,
      })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        const row = Array.isArray(data) ? (data[0] as DeliveryQuote | undefined) : undefined
        if (rpcError || !row) {
          setQuoteError(
            orderErrorMessage(
              rpcError?.message,
              "La livraison n'est pas disponible pour cette destination."
            )
          )
          return
        }
        setQuote(row)
      })

    return () => {
      cancelled = true
    }
  }, [wilayaCode, communeId, method, items.length])

  const total = useMemo(() => subtotal + (quote?.price_dzd ?? 0), [subtotal, quote])

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
        <h1 className="text-xl font-semibold text-offwhite">Votre panier est vide</h1>
        <Link to="/boutique/produits" className="btn-primary mt-6">
          Découvrir la boutique
        </Link>
      </div>
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const normalizedPhone = normalizeAlgerianPhone(phone)
    if (!normalizedPhone) {
      setError('Numéro de téléphone algérien invalide (ex. 0550 12 34 56).')
      return
    }
    if (!wilayaCode || !communeId) {
      setError('Sélectionnez votre wilaya et votre commune.')
      return
    }
    if (!quote) {
      setError("Aucun tarif de livraison actif pour cette destination. Contactez-nous.")
      return
    }
    if (method === 'domicile' && !address.trim()) {
      setError("L'adresse de livraison est requise.")
      return
    }
    if (method === 'stopdesk' && !pickupId) {
      setError('Sélectionnez un point relais.')
      return
    }
    if (!terms) {
      setError('Vous devez accepter les conditions de commande.')
      return
    }

    setSubmitting(true)
    const { data, error: rpcError } = await supabase.rpc('create_guest_order', {
      p_payload: {
        idempotency_key: idempotencyKey.current,
        customer_name: name.trim(),
        phone: normalizedPhone,
        email: email.trim() || null,
        wilaya_code: Number(wilayaCode),
        commune_id: communeId,
        delivery_method: method,
        address: method === 'domicile' ? address.trim() : null,
        pickup_point_id: method === 'stopdesk' ? pickupId : null,
        note: note.trim() || null,
        items: items.map((line) => ({
          product_id: line.productId,
          variant_id: line.variantId,
          quantity: line.quantity,
        })),
      },
    })

    if (rpcError) {
      setSubmitting(false)
      setError(
        orderErrorMessage(
          rpcError.message,
          "La commande n'a pas pu être enregistrée. Vérifiez vos informations et réessayez."
        )
      )
      return
    }

    const created = data as CreatedOrder
    clear()
    navigate(`/boutique/commande/confirmation?token=${created.tracking_token}`)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-3xl font-bold text-offwhite">Commander</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Paiement à la livraison. Aucune carte bancaire n'est demandée.
      </p>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Vos coordonnées</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="label-text">Nom et prénom *</span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input-field"
                  autoComplete="name"
                />
              </label>
              <label className="block">
                <span className="label-text">Téléphone *</span>
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="input-field"
                  placeholder="0550 12 34 56"
                />
              </label>
              <label className="block">
                <span className="label-text">Email (optionnel)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input-field"
                  autoComplete="email"
                />
              </label>
            </div>
          </div>

          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Livraison</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label-text">Wilaya *</span>
                <select
                  required
                  value={wilayaCode}
                  onChange={(event) => setWilayaCode(event.target.value)}
                  className="input-field"
                >
                  <option value="">Sélectionner...</option>
                  {wilayas.map((wilaya) => (
                    <option key={wilaya.code} value={wilaya.code}>
                      {String(wilaya.code).padStart(2, '0')} — {wilaya.name_fr}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label-text">Commune *</span>
                <select
                  required
                  value={communeId}
                  onChange={(event) => setCommuneId(event.target.value)}
                  className="input-field"
                  disabled={!wilayaCode}
                >
                  <option value="">Sélectionner...</option>
                  {communes.map((commune) => (
                    <option key={commune.id} value={commune.id}>
                      {commune.name_fr}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(['domicile', 'stopdesk'] as Method[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMethod(option)
                    setPickupId('')
                  }}
                  aria-pressed={method === option}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    method === option
                      ? 'border-brand-red bg-brand-red/10 text-brand-red-light'
                      : 'border-charcoal-400/20 text-charcoal-300 hover:border-charcoal-300'
                  }`}
                >
                  {DELIVERY_METHOD_LABELS[option]}
                </button>
              ))}
            </div>

            {method === 'domicile' ? (
              <label className="mt-4 block">
                <span className="label-text">Adresse de livraison *</span>
                <textarea
                  required
                  rows={3}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="input-field resize-none"
                  placeholder="Quartier, rue, numéro, repère..."
                />
              </label>
            ) : (
              <label className="mt-4 block">
                <span className="label-text">Point relais *</span>
                <select
                  required
                  value={pickupId}
                  onChange={(event) => setPickupId(event.target.value)}
                  className="input-field"
                  disabled={pickupPoints.length === 0}
                >
                  <option value="">
                    {pickupPoints.length === 0 ? 'Aucun point relais dans cette wilaya' : 'Sélectionner...'}
                  </option>
                  {pickupPoints.map((point) => (
                    <option key={point.id} value={point.id}>
                      {point.name}
                      {point.address ? ` — ${point.address}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-4 rounded-lg border border-charcoal-400/15 bg-charcoal-900/60 px-4 py-3 text-sm">
              {quoteError ? (
                <p className="text-brand-red-light">{quoteError}</p>
              ) : quote ? (
                <div className="flex items-center gap-2 text-charcoal-200">
                  <Truck className="h-4 w-4 text-brand-red" />
                  <span>
                    {formatDzd(quote.price_dzd)}
                    {quote.carrier ? ` · ${quote.carrier}` : ''}
                    {quote.estimated_days_min != null
                      ? ` · ${quote.estimated_days_min}${
                          quote.estimated_days_max != null && quote.estimated_days_max !== quote.estimated_days_min
                            ? `–${quote.estimated_days_max}`
                            : ''
                        } jours`
                      : ''}
                  </span>
                </div>
              ) : (
                <p className="text-charcoal-400">
                  Sélectionnez votre wilaya et votre commune pour afficher les frais de livraison.
                </p>
              )}
            </div>

            <label className="mt-4 block">
              <span className="label-text">Note (optionnel)</span>
              <textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="input-field resize-none"
                placeholder="Instructions particulières, couleur souhaitée..."
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-xs text-charcoal-300">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-red"
            />
            <span>
              J'accepte les conditions de commande et je confirme que les informations fournies sont
              exactes. Le paiement se fait en espèces à la réception.
            </span>
          </label>
        </div>

        <div className="space-y-4">
          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Récapitulatif</h2>
            <ul className="space-y-2 text-sm">
              {items.map((line) => (
                <li key={line.key} className="flex justify-between gap-2 text-charcoal-300">
                  <span className="min-w-0">
                    {line.quantity} × {line.name}
                    {line.variantLabel ? ` (${line.variantLabel})` : ''}
                  </span>
                  <span className="whitespace-nowrap text-offwhite">
                    {formatDzd(line.unitPriceDzd * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 border-t border-charcoal-400/15 pt-3 text-sm">
              <div className="flex justify-between text-charcoal-300">
                <span>Sous-total</span>
                <span>{formatDzd(subtotal)}</span>
              </div>
              <div className="flex justify-between text-charcoal-300">
                <span>Livraison</span>
                <span>{quote ? formatDzd(quote.price_dzd) : '—'}</span>
              </div>
              <div className="flex justify-between pt-1 text-base font-semibold text-offwhite">
                <span>Total</span>
                <span>{formatDzd(total)}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-charcoal-500">
              Montants indicatifs : le total définitif est recalculé par la boutique au moment de
              l'enregistrement.
            </p>
            <button type="submit" disabled={submitting || !quote} className="btn-primary mt-4 w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmer la commande'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
