import { useCallback, useEffect, useState } from 'react'
import {
  Archive, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Eye,
  FileText, Package, ShoppingBag, Tag, Truck, BarChart3, Clock3,
  Layers3, Plus, RefreshCw, Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { orderStatusLabel } from '@/lib/checkout'

type Stats = {
  products_total: number
  products_published: number
  products_draft: number
  categories_total: number
  orders_total: number
  orders_pending: number
  orders_confirmed: number
  orders_shipped: number
  orders_delivered: number
  requests_total: number
  requests_new: number
  requests_reviewing: number
  requests_approved: number
  requests_rejected: number
  quotes_issued: number
  quotes_pending: number
}

const formatCount = (value: number) => new Intl.NumberFormat('fr-DZ').format(value)

const sections = [
  {
    title: 'Ventes & commandes',
    description: 'Suivez les commandes et leur progression.',
    icon: ShoppingBag,
    items: [
      { label: 'Toutes les commandes', key: 'orders_total', to: '/admin/commandes', icon: ShoppingBag },
      { label: 'En attente', key: 'orders_pending', to: '/admin/commandes?status=pending', icon: Clock3 },
      { label: 'Confirmées', key: 'orders_confirmed', to: '/admin/commandes?status=confirmed', icon: CheckCircle2 },
      { label: 'Expédiées', key: 'orders_shipped', to: '/admin/commandes?status=shipped', icon: Truck },
      { label: 'Livrées', key: 'orders_delivered', to: '/admin/commandes?status=delivered', icon: CheckCircle2 },
    ],
  },
  {
    title: 'Demandes & devis sur mesure',
    description: 'De la demande client au devis puis à la fabrication.',
    icon: FileText,
    items: [
      { label: 'Demandes reçues', key: 'requests_total', to: '/admin/demandes', icon: FileText },
      { label: 'Nouvelles demandes', key: 'requests_new', to: '/admin/demandes', icon: Sparkles },
      { label: 'En cours d’étude', key: 'requests_reviewing', to: '/admin/demandes', icon: Clock3 },
      { label: 'Approuvées', key: 'requests_approved', to: '/admin/demandes?view=approved', icon: CheckCircle2 },
      { label: 'Refusées', key: 'requests_rejected', to: '/admin/demandes', icon: Archive },
      { label: 'Devis émis', key: 'quotes_issued', to: '/admin/demandes', icon: FileText },
      { label: 'Devis en attente', key: 'quotes_pending', to: '/admin/demandes', icon: Clock3 },
    ],
  },
  {
    title: 'Catalogue',
    description: 'Produits et organisation de la boutique.',
    icon: Package,
    items: [
      { label: 'Produits', key: 'products_total', to: '/admin/produits', icon: Package },
      { label: 'Publiés', key: 'products_published', to: '/admin/produits', icon: Eye },
      { label: 'Brouillons', key: 'products_draft', to: '/admin/produits', icon: Archive },
      { label: 'Catégories', key: 'categories_total', to: '/admin/categories', icon: Tag },
    ],
  },
] as const

type StatKey = keyof Stats

type PendingOrder = {
  id: string
  order_number: string
  customer_name: string
  total_dzd: number
  status: string
  created_at: string
}

type PendingRequest = {
  id: string
  request_number: string
  customer_name: string
  title: string
  status: string
}

type LowStockProduct = {
  id: string
  name: string
  stock_quantity: number
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  new: 'Nouvelle',
  reviewing: 'En étude',
}

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat('fr-DZ', { day: '2-digit', month: 'short' }).format(new Date(value))

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [newRequests, setNewRequests] = useState<PendingRequest[]>([])
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([])
  const [opsLoading, setOpsLoading] = useState(true)
  const [opsError, setOpsError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('owner_dashboard_stats')
    if (rpcError || !data) {
      setError('Impossible de charger les statistiques. Vérifiez la connexion et vos droits, puis réessayez.')
      setStats(null)
    } else {
      setStats(data as Stats)
    }
    setLoading(false)
  }, [])

  const loadOperations = useCallback(async () => {
    setOpsLoading(true)
    setOpsError(null)
    const [ordersResult, requestsResult, stockResult] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, customer_name, total_dzd, status, created_at')
        .in('status', ['pending', 'confirmed'])
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('custom_requests')
        .select('id, request_number, customer_name, title, status')
        .in('status', ['new', 'reviewing'])
        .is('deletion_started_at', null)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('products')
        .select('id, name, stock_quantity')
        .eq('status', 'published')
        .eq('made_to_order', false)
        .lte('stock_quantity', 5)
        .order('stock_quantity', { ascending: true })
        .limit(5),
    ])

    if (ordersResult.error || requestsResult.error || stockResult.error) {
      setOpsError('Certaines opérations n’ont pas pu être chargées.')
    }
    setPendingOrders((ordersResult.data as PendingOrder[]) ?? [])
    setNewRequests((requestsResult.data as PendingRequest[]) ?? [])
    setLowStock((stockResult.data as LowStockProduct[]) ?? [])
    setOpsLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadOperations() }, [loadOperations])

  const queue = [
    { label: 'Commandes à confirmer', key: 'orders_pending' as const, to: '/admin/commandes?status=pending', icon: ShoppingBag, tone: 'text-amber-300 bg-amber-300/10' },
    { label: 'Nouvelles demandes', key: 'requests_new' as const, to: '/admin/demandes', icon: FileText, tone: 'text-sky-300 bg-sky-300/10' },
    { label: 'Devis en attente', key: 'quotes_pending' as const, to: '/admin/demandes', icon: Clock3, tone: 'text-violet-300 bg-violet-300/10' },
  ]

  return (
    <div className="animate-fade-in space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#20232b] via-[#171a21] to-[#171318] p-5 shadow-2xl shadow-black/10 md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand-red/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-red-light"><span className="h-1.5 w-1.5 rounded-full bg-brand-red" /> LUNDER · CENTRE DE PILOTAGE</p>
            <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">Bonjour, bienvenue dans votre atelier.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal-300">Retrouvez ici les indicateurs essentiels, les actions prioritaires et les accès rapides pour gérer votre activité.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/produits/nouveau" className="btn-primary"><Plus className="h-4 w-4" />Nouveau produit</Link>
            <Link to="/admin/demandes" className="btn-secondary"><FileText className="h-4 w-4" />Demandes sur mesure</Link>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200"><span>{error}</span><button type="button" onClick={() => void load()} className="btn-secondary"><RefreshCw className="h-4 w-4" />Réessayer</button></div>}

      <section aria-label="Priorités" className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><p className="admin-eyebrow">À ne pas manquer</p><h2 className="text-lg font-bold text-white">Votre file de travail</h2></div><span className="text-xs text-charcoal-500">Données en direct</span></div>
        <div className="grid gap-3 md:grid-cols-3">
          {queue.map((item) => (
            <Link key={item.key} to={item.to} className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-charcoal-900/80 p-4 transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-charcoal-800">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tone}`}><item.icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs text-charcoal-400">{item.label}</span><span className="mt-1 block text-2xl font-black tabular-nums text-white">{loading ? '—' : stats ? formatCount(stats[item.key]) : '—'}</span></span>
              <ArrowUpRight className="h-4 w-4 text-charcoal-600 transition group-hover:text-white" />
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Opérations à traiter" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="admin-eyebrow">Opérations</p>
            <h2 className="text-lg font-bold text-white">À traiter maintenant</h2>
            <p className="mt-1 text-xs text-charcoal-500">Les files d’attente et alertes de stock en un coup d’œil.</p>
          </div>
          {opsError ? (
            <button type="button" onClick={() => void loadOperations()} className="text-xs font-semibold text-red-300 hover:text-white">
              {opsError} · Réessayer
            </button>
          ) : (
            <span className="text-xs text-charcoal-500">Mise à jour automatique au chargement</span>
          )}
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <div className="admin-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><ShoppingBag className="h-4 w-4 text-amber-300" /> Commandes à confirmer</h3>
              <Link to="/admin/commandes?status=pending" className="text-[11px] font-semibold text-brand-red-light hover:text-white">Tout voir</Link>
            </div>
            {opsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>
            ) : pendingOrders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-charcoal-500">Aucune commande en attente. Tout est à jour.</p>
            ) : (
              <ul className="space-y-1">
                {pendingOrders.map((order) => (
                  <li key={order.id}>
                    <Link to={`/admin/commandes?status=${order.status}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.045]">
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[11px] text-brand-red-light">{order.order_number}</span>
                        <span className="block truncate text-xs text-charcoal-200">{order.customer_name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs font-semibold text-white">{formatDzd(order.total_dzd)}</span>
                        <span className="block text-[10px] text-charcoal-500">{orderStatusLabel(order.status)} · {formatShortDate(order.created_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><FileText className="h-4 w-4 text-sky-300" /> Demandes à étudier</h3>
              <Link to="/admin/demandes" className="text-[11px] font-semibold text-brand-red-light hover:text-white">Tout voir</Link>
            </div>
            {opsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>
            ) : newRequests.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-charcoal-500">Aucune nouvelle demande sur mesure.</p>
            ) : (
              <ul className="space-y-1">
                {newRequests.map((request) => (
                  <li key={request.id}>
                    <Link to="/admin/demandes" className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.045]">
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[11px] text-brand-red-light">{request.request_number}</span>
                        <span className="block truncate text-xs text-charcoal-200">{request.title || request.customer_name}</span>
                      </span>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-charcoal-300">
                        {REQUEST_STATUS_LABELS[request.status] ?? request.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Package className="h-4 w-4 text-rose-300" /> Stock faible</h3>
              <Link to="/admin/produits" className="text-[11px] font-semibold text-brand-red-light hover:text-white">Gérer</Link>
            </div>
            {opsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>
            ) : lowStock.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-charcoal-500">Aucun produit publié sous le seuil de 5 unités.</p>
            ) : (
              <ul className="space-y-1">
                {lowStock.map((product) => (
                  <li key={product.id}>
                    <Link to={`/admin/produits/${product.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.045]">
                      <span className="min-w-0 truncate text-xs text-charcoal-200">{product.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${product.stock_quantity === 0 ? 'bg-red-500/10 text-red-300' : 'bg-amber-400/10 text-amber-300'}`}>
                        {product.stock_quantity === 0 ? 'Rupture' : `${product.stock_quantity} restant${product.stock_quantity > 1 ? 's' : ''}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div><p className="admin-eyebrow">Vue opérationnelle</p><h2 className="text-lg font-bold text-white">{section.title}</h2><p className="mt-1 text-xs text-charcoal-500">{section.description}</p></div>
            <section.icon className="mb-1 h-5 w-5 text-charcoal-500" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {section.items.map((item) => (
              <Link key={item.key} to={item.to} className="group rounded-2xl border border-white/[0.07] bg-charcoal-900/70 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand-red/30 hover:bg-charcoal-800">
                <div className="mb-4 flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.045] text-charcoal-300 transition group-hover:bg-brand-red/10 group-hover:text-brand-red-light"><item.icon className="h-4 w-4" /></span><ArrowRight className="h-3.5 w-3.5 text-charcoal-600 transition group-hover:translate-x-0.5 group-hover:text-brand-red-light" /></div>
                <p className="text-2xl font-black tabular-nums text-white">{loading ? '—' : stats ? formatCount(stats[item.key as StatKey]) : '—'}</p>
                <p className="mt-1 text-[11px] leading-4 text-charcoal-400">{item.label}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-white/[0.07] bg-charcoal-900/70 p-5">
        <div className="mb-4 flex items-center gap-2"><Layers3 className="h-5 w-5 text-brand-red-light" /><h2 className="font-bold text-white">Accès rapides</h2></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Link to="/admin/commandes" className="flex items-center justify-between rounded-xl border border-white/[0.06] p-3 text-xs font-medium text-charcoal-300 transition hover:border-white/15 hover:text-white"><span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" />Gérer les commandes</span><ArrowUpRight className="h-4 w-4" /></Link>
          <Link to="/admin/calcul-devis" className="flex items-center justify-between rounded-xl border border-white/[0.06] p-3 text-xs font-medium text-charcoal-300 transition hover:border-white/15 hover:text-white"><span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Calculer un devis</span><ArrowUpRight className="h-4 w-4" /></Link>
          <Link to="/admin/finances" className="flex items-center justify-between rounded-xl border border-white/[0.06] p-3 text-xs font-medium text-charcoal-300 transition hover:border-white/15 hover:text-white"><span className="flex items-center gap-2"><ArrowDownRight className="h-4 w-4" />Voir la rentabilité</span><ArrowUpRight className="h-4 w-4" /></Link>
          <Link to="/admin/visual-identity" className="flex items-center justify-between rounded-xl border border-white/[0.06] p-3 text-xs font-medium text-charcoal-300 transition hover:border-white/15 hover:text-white"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Personnaliser la boutique</span><ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  )
}
