import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, FileText, Loader2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { orderErrorMessage } from '@/lib/checkout'

type RequestFile = { id: string; kind: string; storage_path: string; original_name: string }
type Quote = {
  id: string
  version: number
  price_dzd: number
  production_lead_days: number | null
  valid_until: string
  terms: string | null
  status: string
  order_id: string | null
}
type RequestRow = {
  id: string
  request_number: string
  status: string
  customer_name: string
  phone: string
  email: string | null
  title: string
  description: string
  intended_use: string | null
  dimensions: string | null
  dimension_unit: string
  material_preference: string | null
  color_preference: string | null
  quantity: number
  created_at: string
  custom_request_files: RequestFile[]
  custom_quotes: Quote[]
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Reçue',
  reviewing: 'En étude',
  quoted: 'Devis envoyé',
  approved: 'Acceptée',
  rejected: 'Non réalisable',
  closed: 'Clôturée',
}

const today = () => new Date().toISOString().slice(0, 10)

export default function AdminRequests() {
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [quoteRequestId, setQuoteRequestId] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [leadDays, setLeadDays] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [terms, setTerms] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('custom_requests')
      .select('*, custom_request_files(*), custom_quotes(*)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (queryError) {
      setError('Impossible de charger les demandes.')
    } else {
      setRequests((data as RequestRow[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openNewQuote = (request: RequestRow) => {
    setQuoteRequestId(request.id)
    setPrice('')
    setLeadDays('')
    setValidUntil('')
    setTerms('')
    setError(null)
  }

  const submitQuote = async (requestId: string) => {
    setError(null)
    const parsedPrice = Number(price)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('Prix du devis invalide.')
      return
    }
    if (!validUntil || validUntil < today()) {
      setError('La date de validité doit être aujourd’hui ou plus tard.')
      return
    }

    setBusy(true)
    const { error: rpcError } = await supabase.rpc('create_custom_quote', {
      p_request_id: requestId,
      p_price_dzd: Math.round(parsedPrice),
      p_lead_days: leadDays ? Number(leadDays) : null,
      p_valid_until: validUntil,
      p_terms: terms.trim() || null,
    })
    setBusy(false)

    if (rpcError) {
      setError(orderErrorMessage(rpcError.message, "Impossible d'émettre ce devis."))
      return
    }
    setQuoteRequestId(null)
    await load()
  }

  const setStatus = async (requestId: string, status: string) => {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('set_custom_request_status', {
      p_request_id: requestId,
      p_status: status,
    })
    setBusy(false)
    if (rpcError) {
      setError(orderErrorMessage(rpcError.message, 'Impossible de modifier le statut.'))
      return
    }
    await load()
  }

  const openFile = async (file: RequestFile) => {
    setError(null)
    const { data, error: signError } = await supabase.storage
      .from('custom-requests')
      .createSignedUrl(file.storage_path, 600)
    if (signError || !data) {
      setError('Impossible de générer un lien temporaire pour ce fichier.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-2 text-2xl font-bold text-offwhite">Demandes sur mesure</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Étudiez la faisabilité avant d'émettre un devis. Chaque nouveau devis expire la version
        précédente ; un client ne peut accepter qu'une seule version valide, et une seule commande
        en découle.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
        </div>
      ) : requests.length === 0 ? (
        <div className="admin-card py-16 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">Aucune demande pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const open = expanded === request.id
            const latestQuote = [...request.custom_quotes].sort((a, b) => b.version - a.version)[0]
            return (
              <div key={request.id} className="admin-card">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : request.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                  aria-expanded={open}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-offwhite">{request.request_number}</p>
                    <p className="mt-1 truncate text-sm text-charcoal-200">{request.title}</p>
                    <p className="mt-1 text-xs text-charcoal-400">
                      {request.customer_name} · {request.phone} ·{' '}
                      {new Date(request.created_at).toLocaleDateString('fr-DZ')}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span className="rounded-full bg-charcoal-700 px-3 py-1 text-xs text-offwhite">
                      {STATUS_LABELS[request.status] ?? request.status}
                    </span>
                    {latestQuote && (
                      <span className="text-sm font-semibold text-offwhite">
                        {formatDzd(latestQuote.price_dzd)}
                      </span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-charcoal-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {open && (
                  <div className="mt-4 space-y-4 border-t border-charcoal-400/15 pt-4 text-sm">
                    <p className="whitespace-pre-line text-charcoal-300">{request.description}</p>
                    <p className="text-xs text-charcoal-400">
                      Quantité {request.quantity}
                      {request.dimensions ? ` · ${request.dimensions} ${request.dimension_unit}` : ''}
                      {request.intended_use ? ` · ${request.intended_use}` : ''}
                      {request.material_preference ? ` · ${request.material_preference}` : ''}
                      {request.color_preference ? ` · ${request.color_preference}` : ''}
                    </p>

                    {request.custom_request_files.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-400">
                          Fichiers privés
                        </p>
                        <ul className="space-y-1">
                          {request.custom_request_files.map((file) => (
                            <li key={file.id}>
                              <button
                                type="button"
                                onClick={() => openFile(file)}
                                className="text-xs text-brand-red-light underline-offset-4 hover:underline"
                              >
                                Ouvrir {file.original_name} (lien valable 10 min)
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-400">
                        Devis ({request.custom_quotes.length})
                      </p>
                      {request.custom_quotes.length === 0 ? (
                        <p className="text-xs text-charcoal-400">Aucun devis émis.</p>
                      ) : (
                        <ul className="space-y-1">
                          {[...request.custom_quotes]
                            .sort((a, b) => b.version - a.version)
                            .map((quote) => (
                              <li key={quote.id} className="text-xs text-charcoal-300">
                                v{quote.version} · {formatDzd(quote.price_dzd)} · valable jusqu'au{' '}
                                {new Date(quote.valid_until).toLocaleDateString('fr-DZ')} ·{' '}
                                {quote.status}
                                {quote.order_id ? ' · commande créée' : ''}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    {quoteRequestId === request.id ? (
                      <div className="space-y-3 rounded-lg border border-charcoal-400/15 p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="label-text">Prix (DA)</span>
                            <input
                              type="number"
                              min={0}
                              value={price}
                              onChange={(event) => setPrice(event.target.value)}
                              className="input-field"
                            />
                          </label>
                          <label className="block">
                            <span className="label-text">Délai de production (jours)</span>
                            <input
                              type="number"
                              min={0}
                              value={leadDays}
                              onChange={(event) => setLeadDays(event.target.value)}
                              className="input-field"
                            />
                          </label>
                          <label className="block">
                            <span className="label-text">Valable jusqu'au</span>
                            <input
                              type="date"
                              value={validUntil}
                              min={today()}
                              onChange={(event) => setValidUntil(event.target.value)}
                              className="input-field"
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="label-text">Conditions / précisions</span>
                          <textarea
                            rows={3}
                            value={terms}
                            onChange={(event) => setTerms(event.target.value)}
                            className="input-field resize-none"
                            placeholder="Matière, finition, pièce unique, révisions incluses..."
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => submitQuote(request.id)}
                            className="btn-primary"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            Émettre le devis
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuoteRequestId(null)}
                            className="btn-ghost"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openNewQuote(request)} className="btn-primary">
                          Nouveau devis
                        </button>
                        {request.status === 'new' && (
                          <button type="button" onClick={() => setStatus(request.id, 'reviewing')} className="btn-secondary">
                            Marquer en étude
                          </button>
                        )}
                        {['new', 'reviewing', 'quoted'].includes(request.status) && (
                          <>
                            <button type="button" onClick={() => setStatus(request.id, 'rejected')} className="btn-secondary">
                              Non réalisable
                            </button>
                            <button type="button" onClick={() => setStatus(request.id, 'closed')} className="btn-secondary">
                              Clôturer
                            </button>
                          </>
                        )}
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
