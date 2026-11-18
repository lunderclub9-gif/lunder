import { useCallback, useEffect, useState } from 'react'
import {
  Archive, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Eye,
  FileText, Package, ShoppingBag, Tag, Truck, BarChart3, Clock3,
  Layers3, Plus, RefreshCw, Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

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
      { label: 'En attente', key: 'orders_pending', to: '/admin/commandes', icon: Clock3 },
      { label: 'Confirmées', key: 'orders_confirmed', to: '/admin/commandes', icon: CheckCircle2 },
      { label: 'Expédiées', key: 'orders_shipped', to: '/admin/livraison', icon: Truck },
      { label: 'Livrées', key: 'orders_delivered', to: '/admin/commandes', icon: CheckCircle2 },
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => { void load() }, [load])

  const queue = [
    { label: 'Commandes à confirmer', key: 'orders_pending' as const, to: '/admin/commandes', icon: ShoppingBag, tone: 'text-amber-300 bg-amber-300/10' },
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
