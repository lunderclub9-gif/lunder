import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { orderErrorMessage } from '@/lib/checkout'

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
  estimate_price_dzd?: number | null
  estimate_accepted_at?: string | null
  rejection_reason?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Reçue',
  reviewing: 'En cours d’étude',
  quoted: 'Devis envoyé',
  approved: 'Commande créée',
  rejected: 'Non réalisable',
  closed: 'Clôturée',
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  sent: 'À accepter',
  accepted: 'Acceptée — en attente du studio',
  approved: 'Approuvée — commande créée',
  expired: 'Expirée',
  rejected: 'Refusée',
}

export default function CustomRequestStatusPage() {
  const [params] = useSearchParams()
  const token = params.get('token')

  const [request, setRequest] = useState<RequestView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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
  }, [load])

  const decide = async (quote: Quote, decision: 'accept' | 'cancel') => {
    setActionError(null)
    setMessage(null)
    setBusyToken(quote.public_token)
    const { error: rpcError } = await supabase.rpc('decide_custom_quote', {
      p_quote_token: quote.public_token,
      p_decision: decision,
    })
    setBusyToken(null)
    if (rpcError) {
      setActionError(orderErrorMessage(rpcError.message, 'Cette action est impossible.'))
      return
    }
    setMessage(
      decision === 'accept'
        ? 'Estimation acceptée. Le studio doit maintenant vérifier la demande et approuver la fabrication avant toute création de commande.'
        : 'Devis refusé.'
    )
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
        {request.estimate_price_dzd != null && (
          <p className="text-xs text-charcoal-400">
            Estimation acceptée : {formatDzd(request.estimate_price_dzd)}
            {request.estimate_accepted_at
              ? ` le ${new Date(request.estimate_accepted_at).toLocaleDateString('fr-DZ')}`
              : ''}
            {' '}— en attente de vérification par le studio.
          </p>
        )}
        {request.rejection_reason && (
          <p className="text-xs text-brand-red-light">Motif : {request.rejection_reason}</p>
        )}
      </div>

      {message && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {actionError && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {request.order_number && (
        <div className="mt-6 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          Commande créée : <span className="font-mono">{request.order_number}</span>. Le studio
          vous contacte pour la suite.
        </div>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold text-offwhite">Devis et estimations</h2>
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
                  {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-charcoal-400">
                Valable jusqu'au {new Date(quote.valid_until).toLocaleDateString('fr-DZ')}
                {quote.production_lead_days != null
                  ? ` · délai de production ${quote.production_lead_days} jours`
                  : ''}
                {quote.source === 'automatic' ? ' · estimation automatique' : ' · devis manuel'}
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
              {quote.terms && (
                <p className="mt-2 whitespace-pre-line text-sm text-charcoal-300">{quote.terms}</p>
              )}
              {quote.status === 'sent' && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => decide(quote, 'accept')}
                    disabled={busyToken !== null}
                    className="btn-primary"
                  >
                    {busyToken === quote.public_token ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    J’accepte cette estimation
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(quote, 'cancel')}
                    disabled={busyToken !== null}
                    className="text-xs text-charcoal-400 underline-offset-4 hover:underline"
                  >
                    Refuser ce devis
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-charcoal-500">
        Accepter une estimation ne crée pas de commande. Le studio vérifie le fichier et la
        faisabilité, puis approuve explicitement la fabrication. Vous recevrez alors une commande
        avec son suivi.
      </p>

      {validQuote && (
        <p className="mt-2 text-xs text-charcoal-500">
          Une version de devis est encore ouverte. Vous pouvez l’accepter ci-dessus.
        </p>
      )}
    </div>
  )
}
