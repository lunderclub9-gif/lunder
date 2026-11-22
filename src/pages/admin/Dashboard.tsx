import { useCallback, useEffect, useState } from 'react'
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileText,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  Tag,
  Truck,
  Calculator,
  History,
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

type Metric = { label: string; key: keyof Stats; icon: typeof Package; to: string; hint?: string }

const orderMetrics: Metric[] = [
  { label: 'Toutes les commandes', key: 'orders_total', icon: ShoppingBag, to: '/admin/commandes' },
  { label: 'À confirmer', key: 'orders_pending', icon: Archive, to: '/admin/commandes' },
  { label: 'Confirmées', key: 'orders_confirmed', icon: CheckCircle2, to: '/admin/commandes' },
  { label: 'Expédiées', key: 'orders_shipped', icon: Truck, to: '/admin/commandes' },
  { label: 'Livrées', key: 'orders_delivered', icon: CheckCircle2, to: '/admin/commandes' },
]

const requestMetrics: Metric[] = [
  { label: 'Demandes reçues', key: 'requests_total', icon: FileText, to: '/admin/demandes' },
  { label: 'Nouvelles', key: 'requests_new', icon: FileText, to: '/admin/demandes' },
  { label: 'En étude', key: 'requests_reviewing', icon: Eye, to: '/admin/demandes' },
  { label: 'Devis en attente', key: 'quotes_pending', icon: FileText, to: '/admin/demandes' },
  { label: 'Demandes approuvées', key: 'requests_approved', icon: CheckCircle2, to: '/admin/demandes?view=approved' },
]

const catalogMetrics: Metric[] = [
  { label: 'Produits au total', key: 'products_total', icon: Package, to: '/admin/produits' },
  { label: 'Publiés', key: 'products_published', icon: Eye, to: '/admin/produits' },
  { label: 'Brouillons', key: 'products_draft', icon: Archive, to: '/admin/produits' },
  { label: 'Catégories actives', key: 'categories_total', icon: Tag, to: '/admin/categories' },
]

function MetricSection({ title, description, metrics, stats, loading }: {
  title: string
  description: string
  metrics: Metric[]
  stats: Stats | null
  loading: boolean
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-offwhite">{title}</h2>
          <p className="mt-1 text-xs text-charcoal-500">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => (
          <Link key={metric.key} to={metric.to} className="admin-card group min-h-32 transition hover:-translate-y-0.5 hover:border-brand-red/30">
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-charcoal-700 text-charcoal-300 transition group-hover:bg-brand-red/10 group-hover:text-brand-red-light">
                <metric.icon className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-charcoal-600 transition group-hover:translate-x-1 group-hover:text-brand-red-light" />
            </div>
            <div className="mt-4 text-2xl font-bold tabular-nums text-offwhite">
              {loading ? '…' : stats ? (stats[metric.key] ?? 0).toLocaleString('fr-DZ') : '—'}
            </div>
            <div className="mt-1 text-xs leading-5 text-charcoal-400">{metric.label}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

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

  useEffect(() => {
    let active = true
    const run = async () => {
      const { data, error: rpcError } = await supabase.rpc('owner_dashboard_stats')
      if (!active) return
      if (rpcError || !data) {
        setError('Impossible de charger les statistiques. Vérifiez la connexion et vos droits, puis réessayez.')
        setStats(null)
      } else {
        setError(null)
        setStats(data as Stats)
      }
      setLoading(false)
    }
    void run()
    return () => { active = false }
  }, [])

  const attentionItems = [
    { label: 'Commandes à confirmer', key: 'orders_pending' as const, to: '/admin/commandes', icon: ShoppingBag, detail: 'Vérifier les coordonnées et confirmer les commandes.' },
    { label: 'Nouvelles demandes', key: 'requests_new' as const, to: '/admin/demandes', icon: FileText, detail: 'Examiner les projets et les fichiers de référence.' },
    { label: 'Devis en attente', key: 'quotes_pending' as const, to: '/admin/demandes', icon: FileText, detail: 'Consulter les devis qui attendent une décision.' },
  ]

  return (
    <div className="animate-fade-in pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-charcoal-400/15 bg-[radial-gradient(ellipse_at_90%_0%,rgba(220,38,38,0.15),transparent_45%),linear-gradient(135deg,#242424,#171717)] p-5 sm:p-7">
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="admin-eyebrow">LUNDER’S 3D STUDIO · ESPACE PROPRIÉTAIRE</p>
            <h1 className="text-2xl font-bold text-offwhite sm:text-3xl">Vue d’ensemble</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-charcoal-300">
              Retrouvez les priorités du studio, suivez les commandes et gérez votre catalogue depuis un seul endroit.
            </p>
          </div>
          <Link to="/admin/produits/nouveau" className="btn-primary shrink-0">
            <Plus className="h-4 w-4" /> Ajouter un produit
          </Link>
        </div>
      </section>

      {error && (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="btn-secondary">Réessayer</button>
        </div>
      )}

      <section aria-label="Éléments à traiter" className="mt-7">
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-offwhite">Votre file de travail</h2>
            <p className="mt-1 text-xs text-charcoal-500">Les éléments qui demandent une action de votre part.</p>
          </div>
          <span className="rounded-full border border-charcoal-400/15 bg-charcoal-800 px-3 py-1 text-[11px] text-charcoal-300">Priorités</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {attentionItems.map((item) => (
            <Link key={item.key} to={item.to} className="group rounded-xl border border-charcoal-400/15 bg-charcoal-800/70 p-4 transition hover:border-brand-red/35">
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><item.icon className="h-5 w-5" /></span>
                <span className="text-2xl font-bold tabular-nums text-offwhite">{loading ? '…' : stats ? stats[item.key].toLocaleString('fr-DZ') : '—'}</span>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-offwhite">{item.label}</h3>
              <p className="mt-1 text-xs leading-5 text-charcoal-400">{item.detail}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-red-light">Ouvrir <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>

      <MetricSection title="Commandes" description="Suivi des commandes clients par état." metrics={orderMetrics} stats={stats} loading={loading} />
      <MetricSection title="Demandes sur mesure" description="Projets personnalisés, étude et devis." metrics={requestMetrics} stats={stats} loading={loading} />
      <MetricSection title="Catalogue" description="État des produits et catégories publiés dans la boutique." metrics={catalogMetrics} stats={stats} loading={loading} />

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-offwhite">Accès rapides</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Gérer la livraison', description: 'Tarifs, wilayas et points relais', to: '/admin/livraison', icon: Truck },
            { label: 'Tarification sur mesure', description: 'Matières et règles de fabrication', to: '/admin/tarification', icon: Calculator },
            { label: 'Paramètres du magasin', description: 'Coordonnées, politiques et SEO', to: '/admin/parametres', icon: Settings },
            { label: 'Historique des opérations', description: 'Consulter les modifications', to: '/admin/historique', icon: History },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="flex items-center gap-3 rounded-xl border border-charcoal-400/15 bg-charcoal-800/60 p-4 transition hover:border-brand-red/30">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-charcoal-700 text-brand-red-light"><item.icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-offwhite">{item.label}</span>
                <span className="mt-1 block text-xs text-charcoal-500">{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-6 text-xs text-charcoal-500">
        Les indicateurs reflètent les données disponibles dans la base. Les états affichés ne remplacent pas la vérification des commandes et des devis.
      </p>
    </div>
  )
}
