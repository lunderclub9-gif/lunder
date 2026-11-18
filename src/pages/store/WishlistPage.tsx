import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Heart, PackageX, RefreshCw, Trash2 } from 'lucide-react'
import { supabase, type Product } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import { formatDzd } from '@/lib/format'
import { useWishlist } from '@/lib/wishlist'

const primaryImage = (product: Product) =>
  product.product_images?.find((image) => image.is_primary)?.image_url ??
  product.product_images?.[0]?.image_url

export default function WishlistPage() {
  const { items, remove, clear } = useWishlist()
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ids = items.map((item) => item.id)
    if (ids.length === 0) {
      setProducts({})
      setLoading(false)
      setFailed(false)
      return
    }
    let active = true
    setLoading(true)
    setFailed(false)
    void supabase
      .from('products')
      .select('*, category:categories(*), product_images(*)')
      .in('id', ids)
      .eq('status', 'published')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setFailed(true)
          setLoading(false)
          return
        }
        const map: Record<string, Product> = {}
        ;((data as Product[]) ?? []).forEach((product) => { map[product.id] = product })
        setProducts(map)
        setLoading(false)
      })
    return () => { active = false }
  }, [items, reloadKey])

  const available = items.filter((item) => products[item.id])
  const unavailable = items.filter((item) => !products[item.id])

  const handleClear = () => {
    if (window.confirm('Vider votre liste de favoris ?')) clear()
  }

  return (
    <div className="min-h-screen">
      <section className="lz-hero">
        <div className="lz-container py-9 sm:py-11">
          <p className="lz-eyebrow mb-3">Votre sélection personnelle</p>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="lz-display text-[clamp(2rem,4vw,3rem)]">Mes favoris</h1>
              <p className="lz-lead mt-3 max-w-xl">
                Les pièces que vous gardez sous la main. La liste reste sur cet appareil, sans
                compte, et se met à jour avec le catalogue.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-charcoal-400/20 px-3.5 py-2 text-xs text-charcoal-300">
                <Heart className="h-4 w-4 text-brand-red-light" />
                {items.length} pièce{items.length > 1 ? 's' : ''}
              </span>
              {items.length > 0 && (
                <button type="button" onClick={handleClear} className="inline-flex items-center gap-1.5 text-xs font-medium text-charcoal-400 transition hover:text-brand-red-light">
                  <Trash2 className="h-3.5 w-3.5" /> Vider la liste
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="lz-container py-8">
        {items.length === 0 ? (
          <div className="mx-auto max-w-xl">
            <div className="lz-card px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-charcoal-400/20 bg-charcoal-900/60">
                <Heart className="h-7 w-7 text-charcoal-300" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-offwhite">Aucune pièce gardée pour l’instant.</h2>
              <p className="mt-2 text-sm leading-6 text-charcoal-400">
                Utilisez le cœur sur une fiche produit pour la retrouver ici.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Link to="/boutique/produits" className="btn-primary">
                  Parcourir la boutique <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/boutique/sur-mesure" className="btn-secondary">Créer sur mesure</Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {failed && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-red/25 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
                <span>Impossible d’actualiser vos favoris pour le moment.</span>
                <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="btn-ghost">
                  <RefreshCw className="h-4 w-4" /> Réessayer
                </button>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy="true">
                {Array.from({ length: Math.min(4, items.length) }, (_, index) => (
                  <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-charcoal-400/10 bg-charcoal-800/60" />
                ))}
              </div>
            ) : available.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {available.map((item) => {
                  const product = products[item.id]
                  return <ProductCard key={item.id} product={product} imageUrl={primaryImage(product)} />
                })}
              </div>
            ) : null}

            {!loading && available.length === 0 && !failed && (
              <div className="lz-card px-5 py-12 text-center">
                <PackageX className="mx-auto mb-3 h-9 w-9 text-charcoal-500" />
                <p className="text-sm text-charcoal-300">Les pièces gardées ne sont plus au catalogue.</p>
                <Link to="/boutique/produits" className="btn-secondary mt-5">Voir les pièces disponibles</Link>
              </div>
            )}

            {unavailable.length > 0 && !loading && (
              <section className="lz-card p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-offwhite">
                  <PackageX className="h-4 w-4 text-charcoal-400" /> Plus disponibles au catalogue
                </h2>
                <p className="mt-1 text-[11px] text-charcoal-500">
                  Ces pièces ont été retirées ou archivées. Vous pouvez les retirer de vos favoris.
                </p>
                <ul className="mt-4 divide-y divide-charcoal-400/10">
                  {unavailable.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-charcoal-200">{item.name}</span>
                        <span className="block text-[11px] text-charcoal-500">{formatDzd(item.priceDzd)}</span>
                      </span>
                      <div className="flex items-center gap-3">
                        <Link to="/boutique/sur-mesure" className="text-[11px] font-semibold text-brand-red-light hover:text-white">
                          Faire fabriquer
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-charcoal-400 transition hover:text-brand-red-light"
                          aria-label={`Retirer ${item.name} des favoris`}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Retirer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
