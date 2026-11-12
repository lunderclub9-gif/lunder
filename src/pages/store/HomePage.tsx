import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, ArrowRight, Package } from 'lucide-react'
import { supabase, type Product } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'

export default function HomePage() {
  const [featured, setFeatured] = useState<Product[]>([])
  const [recent, setRecent] = useState<Product[]>([])

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase
        .from('products')
        .select('*, category:categories(*), product_images(*)')
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(4)
      setFeatured((f as Product[]) ?? [])

      const { data: r } = await supabase
        .from('products')
        .select('*, category:categories(*), product_images(*)')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(8)
      setRecent((r as Product[]) ?? [])
    })()
  }, [])

  const primaryImage = (p: Product) => p.product_images?.find((img) => img.is_primary)?.image_url ?? p.product_images?.[0]?.image_url

  return (
    <div>
      <section className="relative overflow-hidden border-b border-charcoal-400/10 bg-charcoal-950">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-red/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="max-w-2xl animate-slide-up">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-red/30 bg-brand-red/10 px-3 py-1">
              <Printer className="h-3.5 w-3.5 text-brand-red" />
              <span className="text-xs font-medium tracking-wide text-brand-red-light">Impression 3D professionnelle</span>
            </div>
            <h1 className="text-4xl font-extrabold leading-tight text-offwhite sm:text-5xl lg:text-6xl">
              LUNDER'S 3D STUDIO
            </h1>
            <p className="mt-4 text-lg text-charcoal-300">
              Design · Print · Create — From Imagination to Reality
            </p>
            <p className="mt-2 text-base text-charcoal-400">
              Studio d'impression 3D professionnel en Algérie. Des pièces uniques, fabriquées sur mesure, livrées chez vous.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/boutique/produits" className="btn-primary">
                Découvrir la boutique
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-2xl font-bold text-offwhite">Produits en vedette</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} imageUrl={primaryImage(p)} />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-offwhite">Nouveautés</h2>
          <Link to="/boutique/produits" className="text-sm font-medium text-brand-red hover:text-brand-red-light">
            Tout voir →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="card text-center py-16">
            <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
            <p className="text-charcoal-400">La boutique ouvre bientôt. Revenez vite !</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((p) => (
              <ProductCard key={p.id} product={p} imageUrl={primaryImage(p)} />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-charcoal-400/10 bg-charcoal-950 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-charcoal-800">
                <Printer className="h-6 w-6 text-brand-red" />
              </div>
              <h3 className="text-sm font-semibold text-offwhite">Impression 3D professionnelle</h3>
              <p className="mt-1 text-xs text-charcoal-400">PLA, PETG et plus. Qualité garantie.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-charcoal-800">
                <Package className="h-6 w-6 text-brand-red" />
              </div>
              <h3 className="text-sm font-semibold text-offwhite">Sur mesure</h3>
              <p className="mt-1 text-xs text-charcoal-400">Vous avez une idée ? On l'imprime.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-charcoal-800">
                <ArrowRight className="h-6 w-6 text-brand-red" />
              </div>
              <h3 className="text-sm font-semibold text-offwhite">Livraison en Algérie</h3>
              <p className="mt-1 text-xs text-charcoal-400">Paiement à la livraison.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
