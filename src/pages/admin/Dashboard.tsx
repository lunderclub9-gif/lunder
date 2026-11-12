import { useEffect, useState } from 'react'
import { Package, Tag, Archive, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

type Stats = {
  productCount: number
  publishedCount: number
  categoryCount: number
  draftCount: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    (async () => {
      const [{ count: productCount }, { count: publishedCount }, { count: categoryCount }, { count: draftCount }] =
        await Promise.all([
          supabase.from('products').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from('categories').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
        ])
      setStats({
        productCount: productCount ?? 0,
        publishedCount: publishedCount ?? 0,
        categoryCount: categoryCount ?? 0,
        draftCount: draftCount ?? 0,
      })
    })()
  }, [])

  const cards = [
    { label: 'Produits totaux', value: stats?.productCount ?? '—', icon: Package, to: '/admin/produits' },
    { label: 'Publiés', value: stats?.publishedCount ?? '—', icon: Eye, to: '/admin/produits' },
    { label: 'Brouillons', value: stats?.draftCount ?? '—', icon: Archive, to: '/admin/produits' },
    { label: 'Catégories', value: stats?.categoryCount ?? '—', icon: Tag, to: '/admin/categories' },
  ]

  return (
    <div className="animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold text-offwhite">Tableau de bord</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="admin-card group transition-all hover:border-brand-red/30"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-charcoal-700 transition-colors group-hover:bg-brand-red/10">
              <card.icon className="h-5 w-5 text-charcoal-300 group-hover:text-brand-red" />
            </div>
            <div className="text-2xl font-bold text-offwhite">{card.value}</div>
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
        </div>
      </div>
    </div>
  )
}
