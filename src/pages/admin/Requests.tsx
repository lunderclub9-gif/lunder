import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { orderErrorMessage } from '@/lib/checkout'
import { canOwnerApproveCustomQuote } from '@/lib/custom-workflow'

type RequestFile = { id: string; kind: string; storage_path: string; original_name: string }
type Quote = {
  id: string
  version: number
  price_dzd: number
  production_lead_days: number | null
  valid_until: string
  terms: string | null
  status: string
  source: string
  order_id: string | null
  created_at: string
  decided_at: string | null
  breakdown: {
    lines?: { label: string; amountDzd: number; detail?: string | null }[]
    unitPriceDzd?: number
    quantity?: number
    subtotalDzd?: number
    discountPercent?: number
    discountDzd?: number
    rushFeeDzd?: number
    totalDzd?: number
  } | null
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
  dim_length_mm: number | null
  dim_width_mm: number | null
  dim_height_mm: number | null
  estimate_price_dzd: number | null
  estimate_breakdown: Quote['breakdown']
  estimate_accepted_at: string | null
  delivery_wilaya_code: number | null
  delivery_commune_id: string | null
  delivery_method: string | null
  delivery_address: string | null
  delivery_pickup_point_id: string | null
  rejection_reason: string | null
  delivery_wilaya?: { name_fr: string } | null
  delivery_commune?: { name_fr: string } | null
  delivery_pickup?: { name: string } | null
  manufacturing_options: Record<string, boolean> | null
  rush: boolean
  deletion_started_at: string | null
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

const QUOTE_STATUS_LABELS: Record<string, string> = {
  sent: 'Envoyé — en attente client',
  accepted: 'Accepté par le client — à approuver',
  approved: 'Approuvé — commande créée',
  rejected: 'Refusé',
  expired: 'Expiré',
}

const today = () => new Date().toISOString().slice(0, 10)
const REQUEST_SELECT = '*, custom_request_files(*), custom_quotes(*), delivery_wilaya:wilayas!custom_requests_delivery_wilaya_code_fkey(name_fr), delivery_commune:communes!custom_requests_delivery_commune_id_fkey(name_fr), delivery_pickup:pickup_points!custom_requests_delivery_pickup_point_id_fkey(name)'

export default function AdminRequests() {
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<'active' | 'approved'>(() => searchParams.get('view') === 'approved' ? 'approved' : 'active')
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const handledRequestId = useRef<string | null>(null)
  const requestLoadSequence = useRef(0)

  const [quoteRequestId, setQuoteRequestId] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [leadDays, setLeadDays] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [terms, setTerms] = useState('')

  const [autoRequestId, setAutoRequestId] = useState<string | null>(null)
  const [autoMaterial, setAutoMaterial] = useState('')
  const [autoGrams, setAutoGrams] = useState('')
  const [autoHours, setAutoHours] = useState('')
  const [autoOptions, setAutoOptions] = useState({
    design: false,
    modeling: false,
    assembly: false,
    finishing: false,
    painting: false,
  })
  const [autoRush, setAutoRush] = useState(false)
  const [materials, setMaterials] = useState<{ name: string }[]>([])

  const load = useCallback(async () => {
    const sequence = ++requestLoadSequence.current
    setLoading(true)
    let requestQuery = supabase.from('custom_requests').select(REQUEST_SELECT)
    requestQuery = view === 'approved'
      ? requestQuery.eq('status', 'approved')
      : requestQuery.neq('status', 'approved')
    const [{ data, error: queryError }, { data: mats }] = await Promise.all([
      requestQuery.order('created_at', { ascending: false }).limit(100),
      supabase.from('manufacturing_materials').select('name').eq('is_available', true).order('name'),
    ])
    if (sequence !== requestLoadSequence.current) return
    if (queryError) {
      setError('Impossible de charger les demandes.')
      setRequests([])
    } else {
      setError(null)
      setRequests((data as RequestRow[]) ?? [])
    }
    setMaterials((mats as { name: string }[]) ?? [])
    setLoading(false)
  }, [view])

  useEffect(() => {
    load()
  }, [load])

  const requestedRequestId = searchParams.get('request')
  useEffect(() => {
    if (!requestedRequestId || loading || handledRequestId.current === requestedRequestId) return
    const existing = requests.find((request) => request.id === requestedRequestId)
    handledRequestId.current = requestedRequestId
    if (existing) {
      setExpanded(existing.id)
      return
    }

    void supabase
      .from('custom_requests')
      .select(REQUEST_SELECT)
      .eq('id', requestedRequestId)
      .maybeSingle()
      .then(({ data, error: targetError }) => {
        if (new URLSearchParams(window.location.search).get('request') !== requestedRequestId) return
        if (targetError || !data) {
          setError('La demande liée à cette notification est introuvable ou n’est plus accessible.')
          return
        }
        const target = data as RequestRow
        if (target.status === 'approved' && view !== 'approved') setView('approved')
        else if (target.status !== 'approved' && view === 'approved') setView('active')
        setRequests((current) => [target, ...current.filter((item) => item.id !== target.id)])
        setExpanded(target.id)
      })
  }, [loading, requests, requestedRequestId, view])

  const openNewQuote = (request: RequestRow) => {
    setQuoteRequestId(request.id)
    setPrice('')
    setLeadDays('')
    setValidUntil('')
    setTerms('')
    setError(null)
  }

  const openAutoQuote = (request: RequestRow) => {
    setAutoRequestId(request.id)
    const preferred = request.material_preference?.trim() ?? ''
    setAutoMaterial(materials.some((m) => m.name.toLowerCase() === preferred.toLowerCase()) ? preferred : '')
    setAutoGrams('')
    setAutoHours('')
    setAutoOptions({ design: false, modeling: false, assembly: false, finishing: false, painting: false })
    setAutoRush(false)
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

  const submitAutoQuote = async (requestId: string) => {
    setError(null)
    const grams = Number(autoGrams)
    const hours = Number(autoHours)
    if (!autoMaterial) {
      setError('Sélectionnez une matière.')
      return
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      setError('Poids de matière invalide.')
      return
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      setError('Temps d\'impression invalide.')
      return
    }
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('quote_custom_manufacturing', {
      p_request_id: requestId,
      p_material_name: autoMaterial,
      p_grams: grams,
      p_print_hours: hours,
      p_options: autoOptions,
      p_rush: autoRush,
    })
    setBusy(false)
    if (rpcError) {
      setError(orderErrorMessage(rpcError.message, "Impossible d'émettre ce devis automatique."))
      return
    }
    setAutoRequestId(null)
    await load()
  }

  const createQuoteFromEstimate = async (request: RequestRow) => {
    setError(null)
    if (!request.estimate_price_dzd) {
      setError('Aucune estimation disponible pour cette demande.')
      return
    }
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('create_custom_quote_from_estimate', {
      p_request_id: request.id,
    })
    setBusy(false)
    if (rpcError) {
      setError(orderErrorMessage(rpcError.message, "Impossible de créer le devis depuis l'estimation."))
      return
    }
    await load()
  }

  const approveQuote = async (quote: Quote) => {
    setError(null)
    if (!confirm(`Approuver le devis v${quote.version} et créer la commande ?`)) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('owner_approve_custom_request', {
      p_quote_id: quote.id,
    })
    setBusy(false)
    if (rpcError) {
      setError(orderErrorMessage(rpcError.message, "Impossible d'approuver cette demande."))
      return
    }
    await load()
  }

  const rejectRequest = async (request: RequestRow) => {
    setError(null)
    const reason = prompt('Motif du refus (optionnel) :') ?? ''
    if (!confirm(`Refuser la demande ${request.request_number} ?`)) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('owner_reject_custom_request', {
      p_request_id: request.id,
      p_reason: reason.trim() || null,
    })
    setBusy(false)
    if (rpcError) {
      setError(orderErrorMessage(rpcError.message, 'Impossible de refuser cette demande.'))
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

  const deleteRequest = async (request: RequestRow) => {
    setError(null)
    setNotice(null)
    const confirmation = request.deletion_started_at
      ? `Reprendre la suppression de la demande ${request.request_number} ?`
      : `Supprimer définitivement la demande ${request.request_number} ? Cette action est réservée aux demandes sans devis ni commande.`
    if (!confirm(confirmation)) return

    setBusy(true)
    const { data, error: beginError } = await supabase.rpc('begin_custom_request_deletion', {
      p_request_id: request.id,
    })
    if (beginError || !data) {
      setBusy(false)
      setError(orderErrorMessage(beginError?.message, 'Impossible de préparer la suppression de cette demande.'))
      return
    }

    const deletion = data as { deletion_token?: string; file_paths?: string[] }
    const filePaths = Array.isArray(deletion.file_paths) ? deletion.file_paths : []
    if (!deletion.deletion_token) {
      setBusy(false)
      setError('La préparation de suppression a échoué. Réessayez ou contactez le support technique.')
      return
    }

    if (filePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from('custom-requests').remove(filePaths)
      if (storageError) {
        setBusy(false)
        setError('Suppression préparée mais fichiers non nettoyés. Réessayez pour terminer sans laisser de fichiers orphelins.')
        await load()
        return
      }
    }

    const { error: finishError } = await supabase.rpc('finish_custom_request_deletion', {
      p_request_id: request.id,
      p_deletion_token: deletion.deletion_token,
      p_deleted_paths: filePaths,
    })
    setBusy(false)
    if (finishError) {
      setError(orderErrorMessage(finishError.message, 'Les fichiers ont été nettoyés, mais la suppression de la demande reste à terminer. Réessayez.'))
      await load()
      return
    }
    setNotice(`La demande ${request.request_number} a été supprimée. L’événement reste dans le journal d’audit.`)
    await load()
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-2 text-2xl font-bold text-offwhite">Demandes sur mesure</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Vérifiez la demande et les fichiers, créez ou ajustez le devis, puis approuvez explicitement
        la fabrication pour créer une commande. L’acceptation du devis par le client est informative
        et n’est pas requise pour l’approbation propriétaire. Un nouveau devis expire la version précédente.
      </p>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrer les demandes">
        <button type="button" aria-pressed={view === 'active'} onClick={() => setView('active')} className={view === 'active' ? 'btn-primary' : 'btn-secondary'}>
          Demandes actives
        </button>
        <button type="button" aria-pressed={view === 'approved'} onClick={() => setView('approved')} className={view === 'approved' ? 'btn-primary' : 'btn-secondary'}>
          Approuvées — historique
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-400">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
        </div>
      ) : requests.length === 0 ? (
        <div className="admin-card py-16 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">{view === 'approved' ? 'Aucune demande approuvée dans l’historique.' : 'Aucune demande active pour le moment.'}</p>
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
                      {request.dim_length_mm ? ` · ${request.dim_length_mm} × ${request.dim_width_mm} × ${request.dim_height_mm} mm` : ''}
                      {request.intended_use ? ` · ${request.intended_use}` : ''}
                      {request.material_preference ? ` · ${request.material_preference}` : ''}
                      {request.color_preference ? ` · ${request.color_preference}` : ''}
                      {request.rush ? ' · urgent' : ''}
                    </p>

                    <div className="rounded-lg border border-charcoal-400/15 p-3 text-xs text-charcoal-300">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-400">
                        Client et livraison
                      </p>
                      <p>{request.customer_name} · {request.phone}{request.email ? ` · ${request.email}` : ''}</p>
                      <p className="mt-1">
                        {request.delivery_method === 'stopdesk'
                          ? 'Point relais'
                          : 'Livraison à domicile'}
                        {request.delivery_wilaya?.name_fr
                          ? ` — ${request.delivery_commune?.name_fr ?? ''}, ${request.delivery_wilaya.name_fr}`
                          : ''}
                        {request.delivery_address ? ` — ${request.delivery_address}` : ''}
                        {request.delivery_pickup?.name ? ` — ${request.delivery_pickup.name}` : ''}
                      </p>
                      <p className="mt-1 text-charcoal-500">
                        Estimation acceptée :{' '}
                        {request.estimate_accepted_at
                          ? new Date(request.estimate_accepted_at).toLocaleString('fr-DZ')
                          : 'non'}
                      </p>
                    </div>

                    <div className="rounded-lg border border-charcoal-400/15 p-3 text-xs text-charcoal-300">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-400">
                        Estimation automatique (détail propriétaire)
                      </p>
                      {request.estimate_price_dzd ? (
                        <>
                          <p className="mb-2 text-sm font-semibold text-offwhite">
                            {formatDzd(request.estimate_price_dzd)}
                          </p>
                          {request.estimate_breakdown?.lines && (
                            <ul className="space-y-0.5">
                              {request.estimate_breakdown.lines.map((line, index) => (
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
                            </ul>
                          )}
                        </>
                      ) : (
                        <p className="text-charcoal-400">Aucune estimation automatique.</p>
                      )}
                    </div>

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
                        <ul className="space-y-3">
                          {[...request.custom_quotes]
                            .sort((a, b) => b.version - a.version)
                            .map((quote) => (
                              <li key={quote.id} className="rounded-lg border border-charcoal-400/15 p-2 text-xs text-charcoal-300">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-offwhite">
                                    v{quote.version} · {formatDzd(quote.price_dzd)} · {quote.source === 'automatic' ? 'Automatique' : 'Manuel'}
                                  </span>
                                  <span className="rounded-full bg-charcoal-700 px-2 py-0.5 text-[10px] text-offwhite">
                                    {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-charcoal-400">
                                  Valable jusqu'au {new Date(quote.valid_until).toLocaleDateString('fr-DZ')}
                                  {quote.order_id ? (
                                    <> · <Link to={`/admin/commandes?order=${encodeURIComponent(quote.order_id)}`} className="text-brand-red-light underline underline-offset-2">Ouvrir la commande liée</Link></>
                                  ) : null}
                                </p>
                                {quote.breakdown?.lines && quote.breakdown.lines.length > 0 && (
                                  <ul className="mt-2 space-y-0.5">
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
                                  <p className="mt-2 whitespace-pre-line text-charcoal-400">{quote.terms}</p>
                                )}
                                {!quote.order_id && ['sent', 'accepted'].includes(quote.status) && (
                                  <p className="mt-2 text-[11px] text-charcoal-500">
                                    {quote.status === 'sent'
                                      ? 'Le devis est envoyé. Le propriétaire peut approuver la demande sans attendre une acceptation du client.'
                                      : 'Le client a accepté le devis ; l’approbation du propriétaire reste la décision finale.'}
                                  </p>
                                )}
                                {canOwnerApproveCustomQuote({
                                  requestStatus: request.status,
                                  quoteStatus: quote.status,
                                  validUntil: quote.valid_until,
                                  orderId: quote.order_id,
                                  today: today(),
                                }) && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => approveQuote(quote)}
                                    className="btn-primary mt-2"
                                  >
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Approuver et créer la commande
                                  </button>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    {request.status === 'approved' ? (
                      <p className="rounded-lg border border-green-600/20 bg-green-600/5 p-3 text-xs text-charcoal-300">
                        Demande approuvée : ses détails et devis restent conservés dans cet historique. La commande associée est accessible depuis le devis.
                      </p>
                    ) : autoRequestId === request.id ? (
                      <div className="space-y-3 rounded-lg border border-charcoal-400/15 p-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block">
                            <span className="label-text">Matière</span>
                            <select
                              value={autoMaterial}
                              onChange={(event) => setAutoMaterial(event.target.value)}
                              className="input-field"
                            >
                              <option value="">Sélectionner...</option>
                              {materials.map((m) => (
                                <option key={m.name} value={m.name}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="label-text">Poids matière (g)</span>
                            <input
                              type="number"
                              min={0}
                              value={autoGrams}
                              onChange={(event) => setAutoGrams(event.target.value)}
                              className="input-field"
                            />
                          </label>
                          <label className="block">
                            <span className="label-text">Temps d'impression (h)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={autoHours}
                              onChange={(event) => setAutoHours(event.target.value)}
                              className="input-field"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-charcoal-300">
                          {(
                            [
                              ['design', 'Préparation du design'],
                              ['modeling', 'Modélisation / modification'],
                              ['assembly', 'Assemblage'],
                              ['finishing', 'Ponçage et finition'],
                              ['painting', 'Peinture'],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={autoOptions[key]}
                                onChange={(event) =>
                                  setAutoOptions((current) => ({ ...current, [key]: event.target.checked }))
                                }
                                className="h-3.5 w-3.5 accent-brand-red"
                              />
                              {label}
                            </label>
                          ))}
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={autoRush}
                              onChange={(event) => setAutoRush(event.target.checked)}
                              className="h-3.5 w-3.5 accent-brand-red"
                            />
                            Urgence
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => submitAutoQuote(request.id)}
                            className="btn-primary"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Émettre le devis automatique
                          </button>
                          <button
                            type="button"
                            onClick={() => setAutoRequestId(null)}
                            className="btn-ghost"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : quoteRequestId === request.id ? (
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
                        <button
                          type="button"
                          disabled={busy || !request.estimate_price_dzd}
                          onClick={() => createQuoteFromEstimate(request)}
                          className="btn-primary"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Créer le devis depuis l'estimation
                        </button>
                        <button type="button" onClick={() => openAutoQuote(request)} className="btn-secondary">
                          Devis technique (poids / heures)
                        </button>
                        <button type="button" onClick={() => openNewQuote(request)} className="btn-secondary">
                          Devis manuel
                        </button>
                        {request.status === 'new' && (
                          <button type="button" onClick={() => setStatus(request.id, 'reviewing')} className="btn-secondary">
                            Marquer en étude
                          </button>
                        )}
                        {!['approved', 'rejected', 'closed'].includes(request.status) && (
                          <>
                            <button type="button" disabled={busy} onClick={() => rejectRequest(request)} className="btn-secondary">
                              Refuser la demande
                            </button>
                            <button type="button" onClick={() => setStatus(request.id, 'closed')} className="btn-secondary">
                              Clôturer
                            </button>
                          </>
                        )}
                        {request.status === 'rejected' && request.rejection_reason && (
                          <p className="text-xs text-charcoal-400">Motif : {request.rejection_reason}</p>
                        )}
                        {(request.status === 'new' || request.status === 'reviewing') &&
                          request.custom_quotes.length === 0 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => deleteRequest(request)}
                              className="btn-ghost border border-brand-red/30 text-brand-red-light"
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              {request.deletion_started_at ? 'Reprendre la suppression' : 'Supprimer la demande'}
                            </button>
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
