import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, CheckCircle2, CircleUserRound, ClipboardList, Eye, EyeOff,
  FileText, KeyRound, Loader2, LogOut, Mail, PackageSearch, RefreshCw, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'register'

type AccountOrder = {
  id: string
  order_number: string
  status: string
  total_dzd: number
  created_at: string
  delivery_method: string
  delivery_eta_min: number | null
  delivery_eta_max: number | null
  wilaya_name: string
  commune_name: string
  items: { product_name: string; variant_label: string | null; quantity: number; unit_price_dzd: number; line_total_dzd: number }[] | null
}

type AccountQuote = {
  request_id: string
  version: number
  status: string
  price_dzd: number
  valid_until: string
}

type AccountRequest = {
  id: string
  request_number: string
  tracking_token: string
  title: string
  status: string
  created_at: string
  custom_quotes: AccountQuote[]
}

const orderStatusLabels: Record<string, string> = {
  pending: 'En attente', confirmed: 'Confirmée', shipped: 'Expédiée',
  delivered: 'Livrée', cancelled: 'Annulée',
}
const requestStatusLabels: Record<string, string> = {
  new: 'Nouvelle', reviewing: 'En étude', quoted: 'Devis envoyé',
  approved: 'Approuvée', rejected: 'Refusée', closed: 'Clôturée',
}
const quoteStatusLabels: Record<string, string> = {
  sent: 'À consulter', accepted: 'Accepté — en attente du studio',
  approved: 'Approuvé — commande créée', rejected: 'Refusé', expired: 'Expiré',
}
const deliveryMethodLabels: Record<string, string> = {
  domicile: 'Livraison à domicile', stopdesk: 'Point relais / Stop Desk',
}
const formatAccountDate = (value: string) => new Intl.DateTimeFormat('fr-DZ', {
  dateStyle: 'medium',
}).format(new Date(value))
const formatAccountPrice = (value: number) => new Intl.NumberFormat('fr-DZ').format(value) + ' DA'


export default function CustomerAccountPage() {
  const { session, profile, loading: authLoading, profileUnavailable, signOut } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editing, setEditing] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'recovery')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [accountOrders, setAccountOrders] = useState<AccountOrder[]>([])
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [accountRequests, setAccountRequests] = useState<AccountRequest[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    setEditName(profile?.full_name ?? '')
  }, [profile?.full_name])
  
  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setAccountOrders([])
      setAccountRequests([])
      return
    }

    let active = true
    const loadActivity = async () => {
      setActivityLoading(true)
      setActivityError(null)
      // Fetch every page instead of silently truncating customer history at
      // 20 orders / 20 requests / 50 quotes. Each page has a deterministic order
      // so records are not skipped when the result spans multiple requests.
      const loadAllOrders = async () => {
        const rows: AccountOrder[] = []
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase
            .from('customer_account_orders')
            .select('id, order_number, status, total_dzd, created_at, delivery_method, delivery_eta_min, delivery_eta_max, wilaya_name, commune_name, items')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + 499)
          if (error) throw error
          const page = (data ?? []) as AccountOrder[]
          rows.push(...page)
          if (page.length < 500) break
        }
        return rows
      }

      const loadAllRequests = async () => {
        const rows: Omit<AccountRequest, 'custom_quotes'>[] = []
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase
            .from('customer_account_requests')
            .select('id, request_number, tracking_token, title, status, created_at')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + 499)
          if (error) throw error
          const page = (data ?? []) as Omit<AccountRequest, 'custom_quotes'>[]
          rows.push(...page)
          if (page.length < 500) break
        }
        return rows
      }

      const loadAllQuotes = async () => {
        const rows: AccountQuote[] = []
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase
            .from('customer_account_quotes')
            .select('request_id, version, status, price_dzd, valid_until')
            .order('request_id', { ascending: true })
            .order('version', { ascending: false })
            .range(offset, offset + 499)
          if (error) throw error
          const page = (data ?? []) as AccountQuote[]
          rows.push(...page)
          if (page.length < 500) break
        }
        return rows
      }

      const [orders, requests, quotes] = await Promise.all([
        loadAllOrders(),
        loadAllRequests(),
        loadAllQuotes(),
      ])

      if (!active) return
      setAccountOrders(orders)
      setAccountRequests(requests.map((request) => ({
        ...request,
        custom_quotes: quotes.filter((quote) => quote.request_id === request.id),
      })))
      setActivityLoading(false)
    }

    void loadActivity().catch(() => {
      if (!active) return
      setActivityError('Une erreur inattendue a empêché le chargement de votre historique.')
      setActivityLoading(false)
    })

    return () => { active = false }
  }, [session?.user.id])

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      setMessage({ type: 'error', text: 'Renseignez votre adresse e-mail et votre mot de passe.' })
      return
    }
    if (mode === 'register' && name.trim().length < 2) {
      setMessage({ type: 'error', text: 'Votre nom doit contenir au moins 2 caractères.' })
      return
    }
    if (mode === 'register' && password.length < 8) {
      setMessage({ type: 'error', text: 'Choisissez un mot de passe de 8 caractères minimum.' })
      return
    }

    setSaving(true)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      setSaving(false)
      if (error) setMessage({ type: 'error', text: 'Connexion impossible. Vérifiez vos identifiants et réessayez.' })
      else setMessage({ type: 'success', text: 'Connexion réussie. Bienvenue dans votre espace LUNDER.' })
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name: name.trim() } },
    })
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: error.message.includes('already registered')
        ? 'Cette adresse e-mail possède déjà un compte. Connectez-vous.'
        : 'La création du compte a échoué. Vérifiez les informations et réessayez.' })
      return
    }
    setMessage(data.session
      ? { type: 'success', text: 'Votre compte est créé. Bienvenue chez LUNDER !' }
      : { type: 'info', text: 'Votre compte est presque prêt : confirmez votre adresse e-mail depuis le message reçu.' })
  }

  const requestPasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setMessage({ type: 'error', text: 'Saisissez votre adresse e-mail pour recevoir le lien de réinitialisation.' })
      return
    }
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/boutique/compte?mode=recovery`,
    })
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: 'Impossible d’envoyer le lien. Vérifiez votre adresse et réessayez.' })
      return
    }
    setResetEmailSent(true)
    setMessage({ type: 'success', text: 'Si cette adresse correspond à un compte, un lien de réinitialisation vient d’être envoyé.' })
  }

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les deux mots de passe ne correspondent pas.' })
      return
    }
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: 'La mise à jour a échoué. Ouvrez à nouveau le lien reçu par e-mail et réessayez.' })
      return
    }
    setRecoveryMode(false)
    setNewPassword('')
    setConfirmPassword('')
    window.history.replaceState({}, '', '/boutique/compte')
    setMessage({ type: 'success', text: 'Votre mot de passe a été modifié avec succès.' })
  }

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!session?.user.id || editName.trim().length < 2) {
      setMessage({ type: 'error', text: 'Le nom doit contenir au moins 2 caractères.' })
      return
    }
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: editName.trim() })
      .eq('id', session.user.id)
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: 'Impossible de mettre à jour votre profil. Réessayez.' })
      return
    }
    setEditing(false)
    setMessage({ type: 'success', text: 'Votre profil a été mis à jour.' })
    window.location.reload()
  }

  const handleSignOut = async () => {
    setSaving(true)
    await signOut()
    setSaving(false)
    setMessage({ type: 'success', text: 'Vous êtes déconnecté.' })
  }

  const activeOrders = accountOrders.filter((order) =>
    ['pending', 'confirmed', 'shipped'].includes(order.status)
  ).length
  const quotesToReview = accountRequests.reduce(
    (total, request) => total + (request.custom_quotes ?? []).filter((quote) => quote.status === 'sent').length,
    0
  )

  if (authLoading) {
    return <div className="mx-auto flex min-h-[55vh] max-w-5xl items-center justify-center px-4"><Loader2 className="h-8 w-8 animate-spin text-brand-red" /></div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_85%_15%,rgba(220,38,38,.22),transparent_35%),linear-gradient(135deg,#202127,#111318)] p-6 sm:p-9">
        <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full border border-white/10" />
        <div className="absolute -right-2 -top-4 h-32 w-32 rounded-full border border-brand-red/20" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-red/25 bg-brand-red/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[.18em] text-brand-red-light"><Sparkles className="h-3.5 w-3.5" /> Espace personnel</span>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Votre espace LUNDER</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-charcoal-300">Retrouvez vos informations, accédez au suivi de vos commandes et gérez vos demandes de fabrication sur mesure.</p>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[.06] shadow-2xl shadow-black/20"><CircleUserRound className="h-8 w-8 text-brand-red-light" /></div>
        </div>
      </div>

      {message && <div role="status" className={`mb-6 rounded-xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-400/25 bg-red-500/10 text-red-200' : message.type === 'success' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-sky-400/25 bg-sky-500/10 text-sky-100'}`}>{message.text}</div>}

      {session && !recoveryMode && (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Commandes', value: accountOrders.length, detail: 'Au total' },
            { label: 'En cours', value: activeOrders, detail: 'À suivre' },
            { label: 'Demandes 3D', value: accountRequests.length, detail: 'Sur mesure' },
            { label: 'Devis à consulter', value: quotesToReview, detail: 'Action requise' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/10 bg-charcoal-800/60 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal-500">{stat.label}</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums text-white">{stat.value}</span>
                <span className="text-[10px] text-charcoal-500">{stat.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {session ? (recoveryMode ? (
        <section className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-charcoal-800/80 p-5 sm:p-7">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><KeyRound className="h-6 w-6" /></div>
          <h2 className="text-xl font-bold text-white">Créer un nouveau mot de passe</h2>
          <p className="mt-2 text-sm leading-6 text-charcoal-400">Choisissez un mot de passe sécurisé d’au moins 8 caractères.</p>
          <form onSubmit={updatePassword} className="mt-6 space-y-4">
            <label className="block"><span className="label-text">Nouveau mot de passe</span><input className="input-field" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required /></label>
            <label className="block"><span className="label-text">Confirmer le mot de passe</span><input className="input-field" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required /></label>
            <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Enregistrer le nouveau mot de passe</button>
          </form>
        </section>
      ) : (
        <>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.75fr)]">
          <section className="rounded-2xl border border-white/10 bg-charcoal-800/80 p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><UserRound className="h-5 w-5" /></div>
              <div><h2 className="font-bold text-white">Informations personnelles</h2><p className="text-xs text-charcoal-400">Votre compte sécurisé</p></div>
            </div>
            {profileUnavailable && <p className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">Votre session est active, mais votre profil n’a pas pu être chargé. Actualisez la page ou contactez-nous si le problème persiste.</p>}
            {editing ? (
              <form onSubmit={saveProfile} className="space-y-4">
                <label className="block"><span className="label-text">Nom complet</span><input className="input-field" value={editName} onChange={(event) => setEditName(event.target.value)} minLength={2} maxLength={100} required /></label>
                <div className="flex flex-wrap gap-2"><button className="btn-primary" type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Enregistrer</button><button className="btn-secondary" type="button" onClick={() => { setEditing(false); setEditName(profile?.full_name ?? '') }}>Annuler</button></div>
              </form>
            ) : (
              <div className="space-y-4">
                <div><p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-500">Nom complet</p><p className="mt-1 font-semibold text-white">{profile?.full_name || 'Non renseigné'}</p></div>
                <div><p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-500">Adresse e-mail</p><p className="mt-1 break-all text-sm text-charcoal-200">{session.user.email}</p></div>
                <div><p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-500">Compte</p><p className="mt-1 inline-flex items-center gap-2 text-sm text-emerald-300"><ShieldCheck className="h-4 w-4" /> Connecté et sécurisé</p></div>
                <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Modifier mon nom</button>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <Link to="/boutique/suivi" className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-charcoal-800/80 p-5 transition hover:-translate-y-1 hover:border-brand-red/40">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><PackageSearch className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1"><strong className="block text-sm text-white">Suivre une commande</strong><span className="mt-1 block text-xs text-charcoal-400">Consultez son état avec le numéro et le téléphone utilisés</span></span><ArrowRight className="h-4 w-4 text-charcoal-500 transition group-hover:translate-x-1 group-hover:text-brand-red-light" />
            </Link>
            <Link to="/boutique/sur-mesure" className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-charcoal-800/80 p-5 transition hover:-translate-y-1 hover:border-brand-red/40">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><ClipboardList className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1"><strong className="block text-sm text-white">Nouvelle demande sur mesure</strong><span className="mt-1 block text-xs text-charcoal-400">Décrivez votre idée et recevez une estimation</span></span><ArrowRight className="h-4 w-4 text-charcoal-500 transition group-hover:translate-x-1 group-hover:text-brand-red-light" />
            </Link>
            <button type="button" onClick={handleSignOut} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-charcoal-300 transition hover:border-red-400/30 hover:bg-red-500/5 hover:text-red-200"><LogOut className="h-4 w-4" /> Se déconnecter</button>
            <p className="px-1 text-[11px] leading-5 text-charcoal-500">Les commandes invitées restent consultables avec leur référence et le numéro de téléphone utilisé.</p>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-charcoal-800/70 p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-white"><FileText className="h-5 w-5 text-brand-red-light" /> Mes commandes et demandes</h2>
              <p className="mt-1 text-xs text-charcoal-400">Historique associé à ce compte, visible uniquement après connexion.</p>
            </div>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-charcoal-200 transition hover:border-brand-red/40 hover:text-white" aria-label="Actualiser l’historique">
              <RefreshCw className="h-3.5 w-3.5" /> Actualiser
            </button>
          </div>

          {activityLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-charcoal-400"><Loader2 className="h-5 w-5 animate-spin text-brand-red" /> Chargement de votre historique…</div>
          ) : activityError ? (
            <div role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{activityError}</div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-white">Commandes</h3><span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-charcoal-300">{accountOrders.length}</span></div>
                {accountOrders.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center text-xs text-charcoal-400">Aucune commande liée à ce compte pour le moment.</p>
                ) : (
                  <ul className="space-y-2">
                    {accountOrders.map((order) => (
                      <li key={order.id} className="rounded-xl border border-white/10 bg-charcoal-950/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div><p className="text-sm font-bold text-white">{order.order_number}</p><p className="mt-1 text-[11px] text-charcoal-400">{formatAccountDate(order.created_at)}</p></div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-charcoal-200">{orderStatusLabels[order.status] ?? order.status}</span>
                        </div>
                        <p className="mt-3 text-xs text-charcoal-300">{(order.items ?? []).reduce((sum, item) => sum + item.quantity, 0)} article(s) · {formatAccountPrice(order.total_dzd)}</p>
                        <button type="button" aria-expanded={expandedOrderId === order.id} onClick={() => setExpandedOrderId((current) => current === order.id ? null : order.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-red-light hover:text-white">
                          {expandedOrderId === order.id ? 'Masquer les détails' : 'Voir les détails'} <ArrowRight className={`h-3.5 w-3.5 transition-transform ${expandedOrderId === order.id ? 'rotate-90' : ''}`} />
                        </button>
                        {expandedOrderId === order.id && (
                          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-charcoal-400">Mode de livraison</span>
                              <strong className="text-charcoal-100">{deliveryMethodLabels[order.delivery_method] ?? order.delivery_method}</strong>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-charcoal-400">Destination</span>
                              <strong className="text-right text-charcoal-100">{[order.commune_name, order.wilaya_name].filter(Boolean).join(', ') || 'Non renseignée'}</strong>
                            </div>
                            {(order.delivery_eta_min != null || order.delivery_eta_max != null) && (
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-charcoal-400">Délai estimé</span>
                                <strong className="text-charcoal-100">{order.delivery_eta_min ?? '—'}–{order.delivery_eta_max ?? '—'} jours</strong>
                              </div>
                            )}
                            <div className="space-y-2 border-t border-white/10 pt-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-400">Articles commandés</p>
                              {(order.items ?? []).map((item, index) => (
                                <div key={`${order.id}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                                  <div className="min-w-0"><p className="font-medium text-charcoal-100">{item.product_name}</p>{item.variant_label && <p className="mt-0.5 text-charcoal-500">{item.variant_label}</p>}<p className="mt-0.5 text-charcoal-400">Quantité : {item.quantity} · {formatAccountPrice(item.unit_price_dzd)} / unité</p></div>
                                  <strong className="shrink-0 text-charcoal-100">{formatAccountPrice(item.line_total_dzd)}</strong>
                                </div>
                              ))}
                            </div>
                            <Link to="/boutique/suivi" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-red-light hover:text-white">Accéder au suivi sécurisé <ArrowRight className="h-3.5 w-3.5" /></Link>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-white">Fabrication sur mesure</h3><span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-charcoal-300">{accountRequests.length}</span></div>
                {accountRequests.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center text-xs text-charcoal-400">Aucune demande liée à ce compte pour le moment.</p>
                ) : (
                  <ul className="space-y-2">
                    {accountRequests.map((request) => (
                      <li key={request.id} className="rounded-xl border border-white/10 bg-charcoal-950/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0"><p className="text-sm font-bold text-white">{request.request_number}</p><p className="mt-1 truncate text-xs text-charcoal-300">{request.title}</p></div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-charcoal-200">{requestStatusLabels[request.status] ?? request.status}</span>
                        </div>
                        <p className="mt-2 text-[11px] text-charcoal-400">{formatAccountDate(request.created_at)}</p>
                        <Link to={`/boutique/sur-mesure/suivi?token=${encodeURIComponent(request.tracking_token)}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-red-light hover:text-white">Voir la demande et les devis <ArrowRight className="h-3.5 w-3.5" /></Link>
                        {(request.custom_quotes ?? []).length > 0 && (
                          <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
                            {(request.custom_quotes ?? []).map((quote) => (
                              <p key={quote.version} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-charcoal-300">Devis v{quote.version} · {quoteStatusLabels[quote.status] ?? quote.status}</span><strong className="text-white">{formatAccountPrice(quote.price_dzd)}</strong></p>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <p className="mt-5 border-t border-white/10 pt-4 text-[11px] leading-5 text-charcoal-500">Les demandes et commandes créées avant l’activation de cette liaison ne sont pas automatiquement attribuées à un compte. Elles restent accessibles via leur suivi habituel.</p>
        </section>
        </>
      )) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]">
          <section className="rounded-2xl border border-white/10 bg-charcoal-800/80 p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap gap-2 rounded-xl bg-charcoal-950/70 p-1">
              <button type="button" onClick={() => { setMode('login'); setMessage(null) }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === 'login' ? 'bg-brand-red text-white shadow-lg shadow-brand-red/15' : 'text-charcoal-400 hover:text-white'}`}>Connexion</button>
              <button type="button" onClick={() => { setMode('register'); setMessage(null) }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === 'register' ? 'bg-brand-red text-white shadow-lg shadow-brand-red/15' : 'text-charcoal-400 hover:text-white'}`}>Créer un compte</button>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
              {mode === 'register' && <label className="block"><span className="label-text">Nom complet</span><input className="input-field" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={100} required placeholder="Votre nom" /></label>}
              <label className="block"><span className="label-text">Adresse e-mail</span><span className="relative block"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-500" /><input className="input-field pl-10" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={254} placeholder="vous@exemple.com" /></span></label>
              <label className="block"><span className="label-text">Mot de passe</span><span className="relative block"><KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-500" /><input className="input-field px-10" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} maxLength={128} placeholder="••••••••" /><button type="button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-white">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
              <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
              {mode === 'login' && <button type="button" onClick={requestPasswordReset} disabled={saving} className="w-full text-center text-xs font-semibold text-brand-red-light transition hover:text-white disabled:opacity-50">{saving ? 'Envoi en cours…' : resetEmailSent ? 'Renvoyer le lien de réinitialisation' : 'Mot de passe oublié ? Recevoir un lien'}</button>}
            </form>
            <p className="mt-5 text-center text-[11px] leading-5 text-charcoal-500">Vos identifiants sont gérés par Supabase Auth. LUNDER ne stocke jamais votre mot de passe en clair.</p>
          </section>

          <aside className="rounded-2xl border border-white/10 bg-[linear-gradient(155deg,rgba(220,38,38,.12),rgba(28,30,36,.92)_55%)] p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-brand-red/20 bg-brand-red/10 text-brand-red-light"><ShieldCheck className="h-6 w-6" /></div>
            <h2 className="text-lg font-bold text-white">Un espace simple et sécurisé</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-charcoal-300">
              <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" /> Gérez les informations de votre profil</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" /> Accédez rapidement au suivi de commande</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" /> Lancez une demande de fabrication personnalisée</li>
            </ul>
            <div className="mt-7 border-t border-white/10 pt-5"><p className="text-xs text-charcoal-400">Vous préférez commander sans compte ?</p><Link to="/boutique/produits" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand-red-light hover:text-white">Continuer comme invité <ArrowRight className="h-4 w-4" /></Link></div>
          </aside>
        </div>
      )}
    </div>
  )
}
