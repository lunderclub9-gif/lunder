import { useEffect, useState } from 'react'
import {
  Archive,
  CheckCircle2,
  Eye,
  FileText,
  Package,
  ShoppingBag,
  Tag,
  Truck,
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

const cards: { label: string; key: keyof Stats; icon: typeof Package; to: string }[] = [
  { label: 'Commandes totales', key: 'orders_total', icon: ShoppingBag, to: '/admin/commandes' },
  { label: 'Commandes en attente', key: 'orders_pending', icon: Archive, to: '/admin/commandes' },
  { label: 'Commandes confirmées', key: 'orders_confirmed', icon: CheckCircle2, to: '/admin/commandes' },
  { label: 'Commandes expédiées', key: 'orders_shipped', icon: Truck, to: '/admin/commandes' },
  { label: 'Commandes livrées', key: 'orders_delivered', icon: CheckCircle2, to: '/admin/commandes' },
  { label: 'Demandes sur mesure', key: 'requests_total', icon: FileText, to: '/admin/demandes' },
  { label: 'Nouvelles demandes', key: 'requests_new', icon: FileText, to: '/admin/demandes' },
  { label: 'Demandes en étude', key: 'requests_reviewing', icon: FileText, to: '/admin/demandes' },
  { label: 'Demandes approuvées', key: 'requests_approved', icon: CheckCircle2, to: '/admin/demandes?view=approved' },
  { label: 'Demandes refusées', key: 'requests_rejected', icon: Archive, to: '/admin/demandes' },
  { label: 'Devis émis', key: 'quotes_issued', icon: FileText, to: '/admin/demandes' },
  { label: 'Devis en attente', key: 'quotes_pending', icon: FileText, to: '/admin/demandes' },
  { label: 'Produits totaux', key: 'products_total', icon: Package, to: '/admin/produits' },
  { label: 'Produits publiés', key: 'products_published', icon: Eye, to: '/admin/produits' },
  { label: 'Brouillons', key: 'products_draft', icon: Archive, to: '/admin/produits' },
  { label: 'Catégories', key: 'categories_total', icon: Tag, to: '/admin/categories' },
]

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
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
    void load()
    return () => {
      active = false
    }
  }, [])

  const retry = () => {
    setLoading(true)
    setError(null)
    void supabase.rpc('owner_dashboard_stats').then(({ data, error: rpcError }) => {
      if (rpcError || !data) {
        setError('Impossible de charger les statistiques. Vérifiez la connexion et vos droits, puis réessayez.')
        setStats(null)
      } else {
        setStats(data as Stats)
      }
      setLoading(false)
    })
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-2 text-2xl font-bold text-offwhite">Tableau de bord</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Statistiques issues de la base. Les commandes confirmées n’ont pas de sous-statut de production dans le système actuel.
      </p>

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          <span>{error}</span>
          <button type="button" onClick={retry} className="btn-secondary">Réessayer</button>
        </div>
      )}

      <section aria-label="Éléments à traiter" className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">À traiter</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Commandes en attente', key: 'orders_pending' as const, to: '/admin/commandes', icon: ShoppingBag },
            { label: 'Nouvelles demandes', key: 'requests_new' as const, to: '/admin/demandes', icon: FileText },
            { label: 'Devis en attente', key: 'quotes_pending' as const, to: '/admin/demandes', icon: FileText },
          ].map((item) => (
            <Link key={item.key} to={item.to} className="flex items-center justify-between gap-3 rounded-lg border border-charcoal-400/15 bg-charcoal-800 px-4 py-3 transition-colors hover:border-brand-red/30">
              <span className="flex items-center gap-3 text-sm text-charcoal-200">
                <item.icon className="h-4 w-4 text-brand-red-light" />
                {item.label}
              </span>
              <span className="text-xl font-bold text-offwhite">
                {loading ? '…' : stats ? stats[item.key].toLocaleString('fr-DZ') : '—'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            to={card.to}
            className="admin-card group transition-all hover:border-brand-red/30"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-charcoal-700 transition-colors group-hover:bg-brand-red/10">
              <card.icon className="h-5 w-5 text-charcoal-300 group-hover:text-brand-red" />
            </div>
            <div className="text-2xl font-bold text-offwhite">
              {loading ? '…' : stats ? stats[card.key].toLocaleString('fr-DZ') : '—'}
            </div>
            <div className="mt-1 text-xs text-charcoal-400">{card.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 admin-card">
        <h2 className="mb-4 text-lg font-semibold text-offwhite">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/produits/nouveau" className="btn-primary">
            <Package className="h-4 w-4" />
            Ajouter un produit
          </Link>
          <Link to="/admin/categories" className="btn-secondary">
            <Tag className="h-4 w-4" />
            Gérer les catégories
          </Link>
          <Link to="/admin/demandes" className="btn-secondary">
            <FileText className="h-4 w-4" />
            Voir les demandes
          </Link>
        </div>
      </div>
    </div>
  )
}
