import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, Home, Loader2, Lock, MapPin, ShoppingBag, Store, Truck,
} from 'lucide-react'
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

const METHOD_DETAILS: Record<Method, { icon: typeof Home; title: string; description: string }> = {
  domicile: {
    icon: Home,
    title: DELIVERY_METHOD_LABELS.domicile,
    description: 'Livraison à votre adresse, remise en main propre.',
  },
  stopdesk: {
    icon: Store,
    title: DELIVERY_METHOD_LABELS.stopdesk,
    description: 'Retrait dans un point relais de votre wilaya.',
  },
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, subtotal, clear } = useCart()

  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([])
  const [destinationLoading, setDestinationLoading] = useState(false)
  const [destinationError, setDestinationError] = useState<string | null>(null)

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
  const [quoteLoading, setQuoteLoading] = useState(false)
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
    let cancelled = false
    setCommunes([])
    setCommuneId('')
    setPickupPoints([])
    setPickupId('')
    setDestinationError(null)

    if (!wilayaCode) {
      setDestinationLoading(false)
      return () => { cancelled = true }
    }

    setDestinationLoading(true)
    void Promise.all([
      supabase
        .from('communes')
        .select('id, name_fr')
        .eq('wilaya_code', Number(wilayaCode))
        .eq('is_active', true)
        .order('name_fr'),
      supabase
        .from('pickup_points')
        .select('id, name, address')
        .eq('wilaya_code', Number(wilayaCode))
        .eq('is_active', true)
        .order('name'),
    ]).then(([communesResult, pickupResult]) => {
      if (cancelled) return
      if (communesResult.error || pickupResult.error) {
        setDestinationError('Impossible de charger les communes ou points relais. Vérifiez votre connexion et réessayez.')
        setCommunes([])
        setPickupPoints([])
      } else {
        setCommunes((communesResult.data as Commune[]) ?? [])
        setPickupPoints((pickupResult.data as PickupPoint[]) ?? [])
      }
      setDestinationLoading(false)
    }).catch(() => {
      if (cancelled) return
      setDestinationError('Impossible de charger les informations de livraison. Réessayez.')
      setDestinationLoading(false)
    })

    return () => { cancelled = true }
  }, [wilayaCode])

  // Devis de livraison : la seule source de prix autorisée.
  useEffect(() => {
    let cancelled = false
    setQuote(null)
    setQuoteError(null)

    if (!wilayaCode || !communeId || items.length === 0) {
      setQuoteLoading(false)
      return () => { cancelled = true }
    }

    setQuoteLoading(true)
    const quoteRequest = supabase.rpc('quote_delivery', {
      p_wilaya_code: Number(wilayaCode),
      p_commune_id: communeId,
      p_method: method,
    })
    void Promise.resolve(quoteRequest)
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
          setQuoteLoading(false)
          return
        }
        setQuote(row)
        setQuoteLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setQuoteError('Impossible de calculer les frais de livraison. Vérifiez votre connexion et réessayez.')
        setQuoteLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [wilayaCode, communeId, method, items.length])

  const total = useMemo(() => subtotal + (quote?.price_dzd ?? 0), [subtotal, quote])

  if (items.length === 0) {
    return (
      <div className="lz-container py-20 text-center">
        <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
        <h1 className="text-xl font-semibold text-offwhite">Votre panier est vide</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-400">
          Ajoutez une création à votre panier pour passer commande.
        </p>
        <Link to="/boutique/produits" className="btn-primary mt-6">Découvrir la boutique</Link>
      </div>
    )
  }

  const handleSubmit = async (event: FormEvent) => {
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
      setError('Aucun tarif de livraison actif pour cette destination. Contactez-nous.')
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

  const articleCount = items.reduce((sum, line) => sum + line.quantity, 0)
  const quoteSummary = quote
    ? `${formatDzd(quote.price_dzd)}${quote.carrier ? ` · ${quote.carrier}` : ''}${
        quote.estimated_days_min != null
          ? ` · ${quote.estimated_days_min}${
              quote.estimated_days_max != null && quote.estimated_days_max !== quote.estimated_days_min
                ? `–${quote.estimated_days_max}`
                : ''
            } jours`
          : ''
      }`
    : null

  return (
    <div className="min-h-screen">
      <section className="lz-hero">
        <div className="lz-container py-9 sm:py-11">
          <p className="lz-eyebrow mb-3">Finaliser votre commande</p>
          <h1 className="lz-display text-[clamp(2rem,4vw,3rem)]">Presque à vous.</h1>
          <p className="lz-lead mt-3 max-w-2xl">
            Confirmez vos coordonnées et choisissez votre mode de livraison. Le paiement se fait en
            espèces à la réception.
          </p>
          <ol className="mt-7 flex flex-wrap items-center gap-2 text-[11px] font-semibold sm:gap-4">
            {[
              { label: 'Panier', state: 'done' },
              { label: 'Livraison', state: 'current' },
              { label: 'Confirmation', state: 'todo' },
            ].map((step, index) => (
              <li key={step.label} className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.state === 'done'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : step.state === 'current'
                        ? 'bg-brand-red text-white'
                        : 'bg-charcoal-700/70 text-charcoal-400'
                  }`}
                >
                  {step.state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : `0${index + 1}`}
                </span>
                <span className={step.state === 'todo' ? 'text-charcoal-500' : 'text-offwhite'}>{step.label}</span>
                {index < 2 && <span className="mx-0.5 h-px w-4 bg-charcoal-400/30 sm:w-8" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="lz-container py-8">
        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
          <div className="space-y-5">
            <section className="lz-card p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red-light"><MapPin className="h-4 w-4" /></span>
                <div>
                  <h2 className="text-base font-bold text-offwhite">Vos coordonnées</h2>
                  <p className="text-[11px] text-charcoal-400">Pour vous joindre au sujet de la livraison.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="label-text">Nom et prénom *</span>
                  <input type="text" required value={name} onChange={(event) => setName(event.target.value)} className="input-field" autoComplete="name" />
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
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" autoComplete="email" />
                </label>
              </div>
            </section>

            <section className="lz-card p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red-light"><Truck className="h-4 w-4" /></span>
                <div>
                  <h2 className="text-base font-bold text-offwhite">Livraison</h2>
                  <p className="text-[11px] text-charcoal-400">Les frais sont calculés par la boutique.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label-text">Wilaya *</span>
                  <select required value={wilayaCode} onChange={(event) => setWilayaCode(event.target.value)} className="input-field">
                    <option value="">Sélectionner…</option>
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
                    disabled={!wilayaCode || destinationLoading}
                  >
                    <option value="">{destinationLoading ? 'Chargement…' : 'Sélectionner…'}</option>
                    {communes.map((commune) => (
                      <option key={commune.id} value={commune.id}>{commune.name_fr}</option>
                    ))}
                  </select>
                </label>
              </div>

              {destinationError && (
                <p role="alert" className="mt-3 rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-brand-red-light">
                  {destinationError}
                </p>
              )}

              <fieldset className="mt-5">
                <legend className="label-text">Mode de livraison *</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(METHOD_DETAILS) as Method[]).map((option) => {
                    const detail = METHOD_DETAILS[option]
                    const Icon = detail.icon
                    const selected = method === option
                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                          selected
                            ? 'border-brand-red bg-brand-red/[0.07]'
                            : 'border-charcoal-400/20 hover:border-charcoal-300/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="delivery-method"
                          value={option}
                          checked={selected}
                          onChange={() => {
                            setMethod(option)
                            setPickupId('')
                          }}
                          className="mt-1 h-4 w-4 accent-brand-red"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-offwhite">
                            <Icon className="h-3.5 w-3.5 text-brand-red-light" /> {detail.title}
                          </span>
                          <span className="mt-1 block text-[11px] leading-4 text-charcoal-400">{detail.description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              {method === 'domicile' ? (
                <label className="mt-4 block">
                  <span className="label-text">Adresse de livraison *</span>
                  <textarea
                    required
                    rows={3}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="input-field resize-none"
                    placeholder="Quartier, rue, numéro, repère…"
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
                    disabled={destinationLoading || pickupPoints.length === 0}
                  >
                    <option value="">
                      {destinationLoading
                        ? 'Chargement…'
                        : pickupPoints.length === 0
                          ? 'Aucun point relais dans cette wilaya'
                          : 'Sélectionner…'}
                    </option>
                    {pickupPoints.map((point) => (
                      <option key={point.id} value={point.id}>
                        {point.name}{point.address ? ` — ${point.address}` : ''}
                      </option>
                    ))}
                  </select>
                  {!destinationLoading && wilayaCode && pickupPoints.length === 0 && (
                    <span className="mt-2 block text-[11px] text-amber-300">
                      Choisissez la livraison à domicile ou contactez l’atelier pour cette wilaya.
                    </span>
                  )}
                </label>
              )}

              <div className="mt-4 rounded-xl border border-charcoal-400/15 bg-charcoal-900/50 px-4 py-3 text-sm">
                {quoteError ? (
                  <p className="text-brand-red-light">{quoteError}</p>
                ) : quoteLoading ? (
                  <p className="flex items-center gap-2 text-charcoal-300"><Loader2 className="h-4 w-4 animate-spin" /> Calcul des frais de livraison…</p>
                ) : quoteSummary ? (
                  <div className="flex flex-wrap items-center gap-2 text-charcoal-200">
                    <Truck className="h-4 w-4 text-brand-red-light" />
                    <span>{quoteSummary}</span>
                  </div>
                ) : (
                  <p className="text-charcoal-400">Sélectionnez votre wilaya et votre commune pour afficher les frais.</p>
                )}
              </div>

              <label className="mt-4 block">
                <span className="label-text">Note pour l’atelier (optionnel)</span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="input-field resize-none"
                  placeholder="Instructions particulières, couleur souhaitée…"
                />
              </label>
            </section>

            <label className="flex items-start gap-2.5 rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 p-4 text-xs leading-5 text-charcoal-300">
              <input
                type="checkbox"
                checked={terms}
                onChange={(event) => setTerms(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-red"
              />
              <span>
                J’accepte les conditions de commande et je confirme que les informations fournies
                sont exactes. Le paiement se fait en espèces à la réception.
              </span>
            </label>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="lz-panel p-5">
              <h2 className="text-base font-bold text-offwhite">Récapitulatif</h2>
              <ul className="mt-4 space-y-3">
                {items.map((line) => (
                  <li key={line.key} className="flex items-center gap-3">
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-charcoal-900">
                      {line.imageUrl ? (
                        <img src={line.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center"><ShoppingBag className="h-4 w-4 text-charcoal-500" /></span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-offwhite">{line.name}</span>
                      <span className="block text-[11px] text-charcoal-400">
                        {line.quantity} × {formatDzd(line.unitPriceDzd)}
                        {line.variantLabel ? ` · ${line.variantLabel}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-offwhite">
                      {formatDzd(line.unitPriceDzd * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 space-y-1.5 border-t border-charcoal-400/10 pt-3 text-sm">
                <div className="flex justify-between gap-3 text-charcoal-300">
                  <dt>Articles ({articleCount})</dt>
                  <dd>{formatDzd(subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-charcoal-300">
                  <dt>Livraison</dt>
                  <dd>{quote ? formatDzd(quote.price_dzd) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3 pt-1.5 text-base font-bold text-offwhite">
                  <dt>Total</dt>
                  <dd>{formatDzd(total)}</dd>
                </div>
              </dl>

              <button
                type="submit"
                disabled={submitting || quoteLoading || !quote}
                className="btn-primary mt-4 min-h-12 w-full"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {submitting ? 'Enregistrement…' : 'Confirmer la commande'}
              </button>

              <p className="mt-3 text-[11px] leading-5 text-charcoal-500">
                Montants indicatifs : le total définitif et la disponibilité sont recalculés par la
                boutique au moment de l’enregistrement. Aucun double débit n’est possible en cas de
                double clic.
              </p>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 p-4 text-[11px] leading-5 text-charcoal-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>Vous recevez un numéro de suivi immédiatement après la commande, utilisable sans compte.</span>
            </div>
          </aside>
        </form>
      </div>
    </div>
  )
}
