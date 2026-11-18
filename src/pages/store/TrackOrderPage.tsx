import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock3, Loader2, MapPin, PackageCheck, Search, ShieldCheck, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import {
  DELIVERY_METHOD_LABELS,
  normalizeAlgerianPhone,
  orderErrorMessage,
  orderStatusLabel,
  type TrackedOrder,
} from '@/lib/checkout'

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered'] as const

const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
  pending: 'Enregistrée',
  confirmed: 'Confirmée',
  shipped: 'Expédiée',
  delivered: 'Livrée',
}

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [order, setOrder] = useState<TrackedOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setOrder(null)

    const normalized = normalizeAlgerianPhone(phone)
    if (!normalized) {
      setError('Numéro de téléphone algérien invalide (ex. 0550 12 34 56).')
      return
    }

    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('track_order', {
      p_order_number: orderNumber.trim(),
      p_phone: normalized,
    })
    setLoading(false)

    if (rpcError || !data) {
      setError(orderErrorMessage(rpcError?.message, 'Aucune commande ne correspond à ces informations.'))
      return
    }
    const result = data as TrackedOrder & { found?: boolean; rate_limited?: boolean }
    if (result.found !== true) {
      setError(result.rate_limited
        ? 'Trop de tentatives de recherche. Réessayez dans quelques minutes.'
        : 'Aucune commande ne correspond à ces informations.')
      return
    }
    setOrder(result)
  }

  const activeStep = order ? STEPS.indexOf(order.status as (typeof STEPS)[number]) : -1
  const cancelled = order?.status === 'cancelled'

  return (
    <div className="min-h-screen">
      <section className="lz-hero">
        <div className="lz-container py-10 sm:py-12">
          <p className="lz-eyebrow mb-3">Suivi de commande</p>
          <h1 className="lz-display text-[clamp(2rem,4vw,3rem)]">Où en est ma pièce ?</h1>
          <p className="lz-lead mt-3 max-w-2xl">
            Saisissez votre numéro de commande et le téléphone utilisé lors de la commande.
            Aucun compte n’est nécessaire.
          </p>
        </div>
      </section>

      <div className="lz-container py-8">
        <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <form onSubmit={handleSubmit} className="lz-panel h-fit space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light">
                <Search className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-offwhite">Rechercher ma commande</h2>
                <p className="text-[11px] text-charcoal-400">Les informations figurent sur votre ticket.</p>
              </div>
            </div>

            <label className="block">
              <span className="label-text">Numéro de commande</span>
              <input
                type="text"
                required
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                className="input-field font-mono"
                placeholder="LND-2026-00001"
                autoComplete="off"
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
                autoComplete="tel"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-3.5 py-2.5 text-xs text-brand-red-light">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Rechercher
            </button>

            <p className="flex items-start gap-2 border-t border-charcoal-400/10 pt-4 text-[11px] leading-5 text-charcoal-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              Par sécurité, le suivi demande le numéro de commande et le téléphone associé.
            </p>
          </form>

          <div className="space-y-4">
            {order ? (
              <>
                <div className="lz-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-charcoal-500">Commande</p>
                      <p className="mt-1 break-all font-mono text-sm font-bold text-offwhite">{order.order_number}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                      cancelled ? 'bg-brand-red/10 text-brand-red-light' : 'bg-charcoal-700/60 text-offwhite'
                    }`}>
                      {cancelled ? <Clock3 className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>

                  {!cancelled && (
                    <ol className="mt-6 space-y-0">
                      {STEPS.map((step, index) => {
                        const done = index <= activeStep
                        const current = index === activeStep
                        return (
                          <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
                            {index < STEPS.length - 1 && (
                              <span
                                aria-hidden="true"
                                className={`absolute left-[0.6875rem] top-6 h-full w-px ${done ? 'bg-brand-red/50' : 'bg-charcoal-400/20'}`}
                              />
                            )}
                            <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              done
                                ? 'border-transparent bg-brand-red text-white'
                                : 'border-charcoal-400/30 bg-charcoal-900 text-charcoal-500'
                            }`}>
                              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                            </span>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold ${done ? 'text-offwhite' : 'text-charcoal-400'}`}>
                                {STEP_LABELS[step]}
                                {current && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-brand-red-light">En cours</span>}
                              </p>
                              {step === 'delivered' && (
                                <p className="mt-0.5 text-[11px] text-charcoal-500">Paiement en espèces à la réception.</p>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  )}

                  <dl className="mt-5 space-y-2 border-t border-charcoal-400/10 pt-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-charcoal-400">Articles</dt>
                      <dd className="text-charcoal-100">
                        {order.items_count} article{order.items_count > 1 ? 's' : ''}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-charcoal-400">Total à la livraison</dt>
                      <dd className="font-bold text-offwhite">{formatDzd(order.total_dzd)}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-charcoal-400"><Truck className="h-3.5 w-3.5" /> Livraison</dt>
                      <dd className="text-right text-charcoal-100">
                        {DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-charcoal-400"><MapPin className="h-3.5 w-3.5" /> Destination</dt>
                      <dd className="text-right text-charcoal-100">
                        {[order.commune, `wilaya de ${order.wilaya}`].filter(Boolean).join(', ')}
                      </dd>
                    </div>
                  </dl>
                </div>

                <p className="px-1 text-[11px] leading-5 text-charcoal-500">
                  Le détail complet des articles figure sur le lien de confirmation reçu lors de la
                  commande. Une question ? Contactez l’atelier depuis le pied de page.
                </p>
              </>
            ) : (
              <div className="lz-card flex h-full flex-col justify-center p-6">
                <Clock3 className="mb-4 h-9 w-9 text-charcoal-500" />
                <h2 className="text-base font-bold text-offwhite">Votre commande, étape par étape</h2>
                <p className="mt-2 text-sm leading-6 text-charcoal-400">
                  Le statut est mis à jour à chaque étape : enregistrée, confirmée, expédiée puis
                  livrée. Vous pouvez revenir à tout moment avec les mêmes informations.
                </p>
                <Link to="/boutique/compte" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red-light hover:text-white">
                  Retrouver toutes mes commandes dans mon espace
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
