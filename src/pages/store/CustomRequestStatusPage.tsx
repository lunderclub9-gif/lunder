import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { DELIVERY_METHOD_LABELS, orderErrorMessage } from '@/lib/checkout'

type Quote = {
  version: number
  public_token: string
  price_dzd: number
  production_lead_days: number | null
  valid_until: string
  terms: string | null
  status: string
  source: string
  breakdown: {
    lines?: { label: string; amountDzd: number; detail?: string | null }[]
    discountPercent?: number
    discountDzd?: number
    rushFeeDzd?: number
  } | null
  created_at: string
}

type RequestView = {
  request_number: string
  status: string
  title: string
  description: string
  quantity: number
  dimensions: string | null
  dimension_unit: string
  material_preference: string | null
  color_preference: string | null
  customer_name: string
  files: { kind: string; original_name: string; mime_type: string | null }[]
  quotes: Quote[]
  order_number: string | null
}

type Wilaya = { code: number; name_fr: string }
type Commune = { id: string; name_fr: string }
type PickupPoint = { id: string; name: string; address: string | null }

const STATUS_LABELS: Record<string, string> = {
  new: 'Reçue',
  reviewing: 'En cours d’étude',
  quoted: 'Devis envoyé',
  approved: 'Devis accepté',
  rejected: 'Non réalisable',
  closed: 'Clôturée',
}

export default function CustomRequestStatusPage() {
  const [params] = useSearchParams()
  const token = params.get('token')

  const [request, setRequest] = useState<RequestView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([])
  const [wilayaCode, setWilayaCode] = useState('')
  const [communeId, setCommuneId] = useState('')
  const [method, setMethod] = useState<'domicile' | 'stopdesk'>('domicile')
  const [address, setAddress] = useState('')
  const [pickupId, setPickupId] = useState('')
  const [terms, setTerms] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [orderResult, setOrderResult] = useState<{ order_number: string; tracking_token: string } | null>(null)

  const load = useCallback(async () => {
    if (!token) {
      setError('Lien incomplet.')
      setLoading(false)
      return
    }
    const { data, error: rpcError } = await supabase.rpc('get_custom_request_by_token', {
      p_token: token,
    })
    if (rpcError || !data) {
      setError(orderErrorMessage(rpcError?.message, 'Demande introuvable.'))
    } else {
      setRequest(data as RequestView)
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    load()
    supabase
      .from('wilayas')
      .select('code, name_fr')
      .eq('is_active', true)
      .order('code')
      .then(({ data }) => setWilayas((data as Wilaya[]) ?? []))
  }, [load])

  useEffect(() => {
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
      .then(({ data }) => setPickupPoints((data as PickupPoint[]) ?? []))
  }, [wilayaCode])

  const cancelQuote = async (quote: Quote) => {
    setApprovalError(null)
    setCancelling(quote.public_token)
    const { error: rpcError } = await supabase.rpc('decide_custom_quote', {
      p_quote_token: quote.public_token,
      p_decision: 'cancel',
    })
    setCancelling(null)
    if (rpcError) {
      setApprovalError(orderErrorMessage(rpcError.message, "Impossible d'annuler ce devis."))
      return
    }
    await load()
  }

  const approve = async (quote: Quote) => {
    setApprovalError(null)
    if (!wilayaCode || !communeId) {
      setApprovalError('Sélectionnez votre wilaya et votre commune.')
      return
    }
    if (method === 'domicile' && !address.trim()) {
      setApprovalError("L'adresse de livraison est requise.")
      return
    }
    if (method === 'stopdesk' && !pickupId) {
      setApprovalError('Sélectionnez un point relais.')
      return
    }
    if (!terms) {
      setApprovalError('Vous devez accepter le devis et les conditions de commande.')
      return
    }

    setApproving(quote.public_token)
    const { data, error: rpcError } = await supabase.rpc('decide_custom_quote', {
      p_quote_token: quote.public_token,
      p_decision: 'accept',
      p_delivery: {
        wilaya_code: Number(wilayaCode),
        commune_id: communeId,
        delivery_method: method,
        address: method === 'domicile' ? address.trim() : null,
        pickup_point_id: method === 'stopdesk' ? pickupId : null,
      },
    })
    setApproving(null)

    if (rpcError) {
      setApprovalError(
        orderErrorMessage(rpcError.message, "Le devis n'a pas pu être accepté.")
      )
      return
    }
    setOrderResult(data as { order_number: string; tracking_token: string })
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-offwhite">Demande introuvable</h1>
        <p className="mt-2 text-sm text-charcoal-400">{error}</p>
        <Link to="/boutique/sur-mesure" className="btn-primary mt-6">
          Nouvelle demande
        </Link>
      </div>
    )
  }

  const validQuote = request.quotes.find((quote) => quote.status === 'sent')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="font-mono text-xs text-charcoal-400">{request.request_number}</p>
      <h1 className="mt-1 text-2xl font-bold text-offwhite">{request.title}</h1>
      <p className="mt-1 text-sm text-charcoal-300">
        Statut : {STATUS_LABELS[request.status] ?? request.status}
      </p>

      <div className="admin-card mt-6 space-y-2 text-sm text-charcoal-300">
        <p>{request.description}</p>
        <p className="text-xs text-charcoal-400">
          Quantité {request.quantity}
          {request.dimensions ? ` · ${request.dimensions} ${request.dimension_unit}` : ''}
          {request.material_preference ? ` · ${request.material_preference}` : ''}
          {request.color_preference ? ` · ${request.color_preference}` : ''}
        </p>
        {request.files.length > 0 && (
          <p className="text-xs text-charcoal-400">
            {request.files.length} fichier(s) transmis — conservés en privé.
          </p>
        )}
      </div>

      {orderResult && (
        <div className="mt-6 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          Devis accepté. Commande{' '}
          <span className="font-mono">{orderResult.order_number}</span> créée.{' '}
          <Link
            to={`/boutique/commande/confirmation?token=${orderResult.tracking_token}`}
            className="underline"
          >
            Voir la commande
          </Link>
        </div>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold text-offwhite">Devis</h2>
      {request.quotes.length === 0 ? (
        <p className="text-sm text-charcoal-400">
          Aucun devis pour le moment. Nous étudions la faisabilité de votre demande.
        </p>
      ) : (
        <div className="space-y-3">
          {request.quotes.map((quote) => (
            <div key={quote.public_token} className="admin-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-offwhite">
                  Version {quote.version} · {formatDzd(quote.price_dzd)}
                </span>
                <span className="rounded-full bg-charcoal-700 px-3 py-1 text-xs text-offwhite">
                  {quote.status === 'sent'
                    ? 'À accepter'
                    : quote.status === 'approved'
                      ? 'Accepté'
                      : quote.status === 'expired'
                        ? 'Expiré'
                        : 'Refusé'}
                </span>
              </div>
              <p className="mt-1 text-xs text-charcoal-400">
                Valable jusqu'au {new Date(quote.valid_until).toLocaleDateString('fr-DZ')}
                {quote.production_lead_days != null
                  ? ` · délai de production ${quote.production_lead_days} jours`
                  : ''}
              </p>
              {quote.breakdown?.lines && quote.breakdown.lines.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-charcoal-300">
                  {quote.breakdown.lines.map((line, index) => (
                    <li key={index} className="flex justify-between gap-2">
                      <span>
                        {line.label}
                        {line.detail ? (
                          <span className="ml-1 text-charcoal-500">({line.detail})</span>
                        ) : null}
                      </span>
                      <span>{formatDzd(line.amountDzd)}</span>
                    </li>
                  ))}
                  {quote.breakdown.discountPercent ? (
                    <li className="flex justify-between gap-2 text-green-400">
                      <span>Remise {quote.breakdown.discountPercent} %</span>
                      <span>-{formatDzd(quote.breakdown.discountDzd ?? 0)}</span>
                    </li>
                  ) : null}
                  {quote.breakdown.rushFeeDzd ? (
                    <li className="flex justify-between gap-2">
                      <span>Supplément urgence</span>
                      <span>{formatDzd(quote.breakdown.rushFeeDzd)}</span>
                    </li>
                  ) : null}
                </ul>
              )}
              {quote.terms && <p className="mt-2 whitespace-pre-line text-sm text-charcoal-300">{quote.terms}</p>}
              {quote.status === 'sent' && !orderResult && (
                <button
                  type="button"
                  onClick={() => cancelQuote(quote)}
                  disabled={cancelling !== null}
                  className="mt-2 text-xs text-charcoal-400 underline-offset-4 hover:underline"
                >
                  {cancelling === quote.public_token ? 'Annulation...' : 'Refuser ce devis'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {validQuote && !orderResult && (
        <div className="admin-card mt-6">
          <h2 className="mb-2 text-lg font-semibold text-offwhite">
            Accepter le devis (version {validQuote.version})
          </h2>
          <p className="mb-4 text-xs text-charcoal-400">
            L'acceptation crée une commande avec paiement à la livraison. Les frais de livraison sont
            calculés par la boutique.
          </p>

          {approvalError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{approvalError}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label-text">Wilaya</span>
              <select value={wilayaCode} onChange={(event) => setWilayaCode(event.target.value)} className="input-field">
                <option value="">Sélectionner...</option>
                {wilayas.map((wilaya) => (
                  <option key={wilaya.code} value={wilaya.code}>
                    {String(wilaya.code).padStart(2, '0')} — {wilaya.name_fr}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label-text">Commune</span>
              <select
                value={communeId}
                onChange={(event) => setCommuneId(event.target.value)}
                className="input-field"
                disabled={!wilayaCode}
              >
                <option value="">Sélectionner...</option>
                {communes.map((commune) => (
                  <option key={commune.id} value={commune.id}>{commune.name_fr}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(['domicile', 'stopdesk'] as const).map((option) => (
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
            <label className="mt-3 block">
              <span className="label-text">Adresse de livraison</span>
              <textarea
                rows={2}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="input-field resize-none"
              />
            </label>
          ) : (
            <label className="mt-3 block">
              <span className="label-text">Point relais</span>
              <select
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

          <label className="mt-3 flex items-start gap-2 text-xs text-charcoal-300">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-red"
            />
            <span>
              J'accepte le devis version {validQuote.version}
              {quoteExpiredHint(validQuote.valid_until, today)} et les conditions de commande.
            </span>
          </label>

          <button
            type="button"
            onClick={() => approve(validQuote)}
            disabled={approving !== null}
            className="btn-primary mt-4 w-full"
          >
            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accepter et commander'}
          </button>
        </div>
      )}
    </div>
  )
}

function quoteExpiredHint(validUntil: string, today: string): string {
  return validUntil < today ? ' (devis expiré)' : ''
}
