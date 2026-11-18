import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownUp, ArrowRight, Mail, MessageCircle, Phone, RefreshCw,
  Search, ShoppingBag, Users, UserRound, Wallet, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { normalizeAlgerianPhone, orderStatusLabel } from '@/lib/checkout'
import { toMailtoHref, toTelHref, toWhatsAppHref } from '@/lib/contact'

type OrderRecord = {
  id: string
  order_number: string
  customer_name: string
  phone: string
  email: string | null
  total_dzd: number
  status: string
  created_at: string
}

type CustomerRecord = {
  key: string
  name: string
  phone: string
  email: string | null
  orders: OrderRecord[]
  deliveredTotal: number
  lastOrderAt: string
}

type SortMode = 'recent' | 'orders' | 'delivered'

function customerKey(order: OrderRecord) {
  return normalizeAlgerianPhone(order.phone)
    ?? order.email?.trim().toLowerCase()
    ?? order.id
}

export default function AdminCustomers() {
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, phone, email, total_dzd, status, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (queryError) {
      setError('Impossible de charger le répertoire client. Vérifiez vos droits et votre connexion.')
    } else {
      setError(null)
      setOrders((data as OrderRecord[]) ?? [])
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const customers = useMemo(() => {
    const grouped = new Map<string, CustomerRecord>()
    for (const order of orders) {
      const key = customerKey(order)
      const existing = grouped.get(key)
      if (existing) {
        existing.orders.push(order)
        if (order.status === 'delivered') existing.deliveredTotal += order.total_dzd
      } else {
        grouped.set(key, {
          key,
          name: order.customer_name || 'Client sans nom',
          phone: order.phone,
          email: order.email,
          orders: [order],
          deliveredTotal: order.status === 'delivered' ? order.total_dzd : 0,
          lastOrderAt: order.created_at,
        })
      }
    }
    return [...grouped.values()]
  }, [orders])

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    const filtered = customers.filter((customer) =>
      !term || [customer.name, customer.phone, customer.email ?? '', ...customer.orders.map((order) => order.order_number)]
        .some((value) => value.toLocaleLowerCase().includes(term))
    )
    return filtered.sort((a, b) => {
      if (sort === 'orders') return b.orders.length - a.orders.length
      if (sort === 'delivered') return b.deliveredTotal - a.deliveredTotal
      return new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime()
    })
  }, [customers, search, sort])

  const repeatCustomers = customers.filter((customer) => customer.orders.length > 1).length
  const deliveredRevenue = orders.reduce((sum, order) => sum + (order.status === 'delivered' ? order.total_dzd : 0), 0)

  return (
    <div className="animate-fade-in space-y-6">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Relation client</p>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Clients</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal-400">Un répertoire construit à partir des commandes réelles : coordonnées, fréquence d’achat et historique récent. Aucun profil client fictif n’est créé.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="btn-secondary shrink-0">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      {error && <div role="alert" className="admin-feedback admin-feedback-error">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="admin-card flex items-center gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><Users className="h-5 w-5" /></span><div><p className="text-xs text-charcoal-400">Clients identifiés</p><p className="mt-1 text-2xl font-black tabular-nums text-white">{customers.length}</p></div></div>
        <div className="admin-card flex items-center gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><UserRound className="h-5 w-5" /></span><div><p className="text-xs text-charcoal-400">Clients récurrents</p><p className="mt-1 text-2xl font-black tabular-nums text-white">{repeatCustomers}</p></div></div>
        <div className="admin-card flex items-center gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><Wallet className="h-5 w-5" /></span><div><p className="text-xs text-charcoal-400">Commandes livrées (montant)</p><p className="mt-1 text-xl font-black tabular-nums text-white">{formatDzd(deliveredRevenue)}</p></div></div>
      </div>

      <div className="admin-card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-500" />
            <input className="input-field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher nom, téléphone, e-mail ou commande…" aria-label="Rechercher un client" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche" className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-500 hover:text-white"><X className="h-4 w-4" /></button>}
          </label>
          <label className="relative sm:w-56">
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-500" />
            <select className="input-field pl-10" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Trier les clients">
              <option value="recent">Plus récents</option><option value="orders">Plus de commandes</option><option value="delivered">Montant livré</option>
            </select>
          </label>
        </div>

        {loading ? <div className="py-16 text-center text-sm text-charcoal-400">Chargement du répertoire client…</div>
          : visible.length === 0 ? <div className="py-16 text-center"><Users className="mx-auto mb-3 h-9 w-9 text-charcoal-600" /><p className="font-semibold text-white">Aucun client trouvé</p><p className="mt-1 text-xs text-charcoal-500">Les clients apparaissent après leur première commande.</p></div>
          : <div className="space-y-3">
            {visible.map((customer) => {
              const isExpanded = expanded === customer.key
              const phoneHref = toTelHref(customer.phone)
              const whatsappHref = toWhatsAppHref(customer.phone)
              const mailHref = toMailtoHref(customer.email)
              return (
                <article key={customer.key} className="overflow-hidden rounded-xl border border-white/[.07] bg-charcoal-900/55">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-red/20 bg-brand-red/10 text-sm font-bold text-brand-red-light">{customer.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CL'}</span>
                      <div className="min-w-0"><h2 className="truncate font-bold text-white">{customer.name}</h2><p className="mt-1 truncate text-xs text-charcoal-400">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p><p className="mt-1 text-[11px] text-charcoal-500">Dernière commande : {new Intl.DateTimeFormat('fr-DZ', { dateStyle: 'medium' }).format(new Date(customer.lastOrderAt))}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:w-52">
                      <div><p className="text-[10px] uppercase tracking-wider text-charcoal-500">Commandes</p><p className="mt-1 font-bold tabular-nums text-white">{customer.orders.length}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wider text-charcoal-500">Livrées</p><p className="mt-1 font-bold tabular-nums text-emerald-300">{formatDzd(customer.deliveredTotal)}</p></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {phoneHref && <a href={phoneHref} aria-label={`Appeler ${customer.name}`} title="Appeler" className="btn-ghost border border-white/10"><Phone className="h-4 w-4" /></a>}
                      {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${customer.name}`} title="WhatsApp" className="btn-ghost border border-white/10"><MessageCircle className="h-4 w-4" /></a>}
                      {mailHref && <a href={mailHref} aria-label={`E-mail ${customer.name}`} title="E-mail" className="btn-ghost border border-white/10"><Mail className="h-4 w-4" /></a>}
                      <button type="button" onClick={() => setExpanded(isExpanded ? null : customer.key)} className="btn-secondary">{isExpanded ? 'Fermer' : 'Historique'} <ArrowRight className={`h-3.5 w-3.5 transition ${isExpanded ? 'rotate-90' : ''}`} /></button>
                    </div>
                  </div>
                  {isExpanded && <div className="border-t border-white/[.07] bg-black/10 p-4"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-charcoal-400"><ShoppingBag className="h-4 w-4" /> Commandes récentes</div><div className="space-y-2">{customer.orders.slice(0, 6).map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[.06] bg-charcoal-900/70 px-3 py-2.5"><div><p className="font-mono text-xs font-semibold text-white">{order.order_number}</p><p className="mt-1 text-[11px] text-charcoal-500">{new Intl.DateTimeFormat('fr-DZ', { dateStyle: 'medium' }).format(new Date(order.created_at))} · {orderStatusLabel(order.status)}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold tabular-nums text-white">{formatDzd(order.total_dzd)}</span><Link to={`/admin/commandes?order=${encodeURIComponent(order.id)}`} className="text-xs font-semibold text-brand-red-light hover:text-white">Ouvrir <ArrowRight className="inline h-3 w-3" /></Link></div></div>)}</div></div>}
                </article>
              )
            })}
          </div>}
        <p className="text-[11px] leading-5 text-charcoal-500">Répertoire calculé sur les 500 dernières commandes non archivées. Les montants affichés comme livrés ne comprennent que les commandes au statut « livrée » ; les commandes annulées restent visibles dans l’historique.</p>
        <p className="text-xs text-charcoal-400">{visible.length} client(s) affiché(s) sur {customers.length} chargé(s).</p>
      </div>
    </div>
  )
}
