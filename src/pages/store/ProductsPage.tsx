import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowDownWideNarrow, Package, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { supabase, type Product, type Category } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import { sanitizeSearchTerm } from '@/lib/format'
import posthog, { isPostHogEnabled } from '@/lib/posthog'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'price-asc' | 'price-desc'>('newest')

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (!active) return
      if (error) {
        console.error('[LUNDER] chargement des catégories impossible')
        setCategories([])
        return
      }
      setCategories((data as Category[]) ?? [])
    })()
    return () => { active = false }
  }, [])

  const urlQuery = searchParams.get('q') ?? ''
  useEffect(() => {
    setSearch((current) => (current === urlQuery ? current : urlQuery))
  }, [urlQuery])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    let query = supabase
      .from('products')
      .select('*, category:categories(*), product_images(*)')
      .eq('status', 'published')

    if (activeCategory) query = query.eq('category_id', activeCategory)

    const term = sanitizeSearchTerm(search)
    if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`)

    if (sortOrder === 'price-asc') query = query.order('price_dzd', { ascending: true })
    else if (sortOrder === 'price-desc') query = query.order('price_dzd', { ascending: false })
    else query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) {
      console.error('[LUNDER] chargement des produits impossible', error.code ?? 'erreur inconnue')
      setProducts([])
      setFailed(true)
      setLoading(false)
      return
    }

    setProducts((data as Product[]) ?? [])
    setFailed(false)
    setLoading(false)
  }, [activeCategory, search, sortOrder])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const primaryImage = (product: Product) =>
    product.product_images?.find((image) => image.is_primary)?.image_url ??
    product.product_images?.[0]?.image_url

  const applyCategoryFilter = (categoryId: string) => {
    setActiveCategory(categoryId)
    if (isPostHogEnabled) {
      posthog.capture('product_filter_applied', {
        filter_type: categoryId ? 'category' : 'all_products',
        category_id: categoryId || undefined,
      })
    }
  }

  const updateSearch = (value: string) => {
    setSearch(value)
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const resetFilters = () => {
    setSearch('')
    setActiveCategory('')
    setSortOrder('newest')
    setSearchParams({}, { replace: true })
  }

  const activeCategoryName = categories.find((category) => category.id === activeCategory)?.name

  return (
    <div className="min-h-screen">
      <section className="border-b border-charcoal-400/10 bg-charcoal-950">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 lg:px-8">
          <p className="mb-2 text-xs font-bold tracking-[0.2em] text-brand-red-light">LUNDER'S 3D STUDIO</p>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-offwhite sm:text-4xl">La boutique</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-charcoal-400">Explorez nos créations 3D, trouvez votre prochain coup de cœur ou lancez une fabrication personnalisée.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-charcoal-400">
              <Package className="h-4 w-4 text-brand-red-light" />
              <span>{loading ? 'Mise à jour du catalogue…' : `${products.length} produit${products.length > 1 ? 's' : ''}`}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/45 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
              <input
                type="search"
                placeholder="Que recherchez-vous ?"
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                className="input-field min-h-12 pl-11 pr-10"
                aria-label="Rechercher un produit"
              />
              {search && (
                <button type="button" onClick={() => updateSearch('')} aria-label="Effacer la recherche" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-charcoal-400 hover:bg-charcoal-700 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            <label className="relative block sm:w-52">
              <ArrowDownWideNarrow className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)} className="input-field min-h-12 pl-10" aria-label="Trier les produits">
                <option value="newest">Plus récents</option>
                <option value="price-asc">Prix croissant</option>
                <option value="price-desc">Prix décroissant</option>
              </select>
            </label>
          </div>

          {categories.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-charcoal-400"><SlidersHorizontal className="h-3.5 w-3.5" /> Catégories</div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <button type="button" onClick={() => applyCategoryFilter('')} aria-pressed={!activeCategory} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${!activeCategory ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'border border-charcoal-400/20 bg-charcoal-900 text-charcoal-300 hover:border-charcoal-300 hover:text-white'}`}>Tout voir</button>
                {categories.map((category) => (
                  <button key={category.id} type="button" onClick={() => applyCategoryFilter(category.id)} aria-pressed={activeCategory === category.id} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${activeCategory === category.id ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'border border-charcoal-400/20 bg-charcoal-900 text-charcoal-300 hover:border-charcoal-300 hover:text-white'}`}>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {(search || activeCategory) && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-charcoal-300">
              Résultats pour {search ? <strong className="text-offwhite">« {search} »</strong> : null}
              {search && activeCategoryName ? ' · ' : null}
              {activeCategoryName ? <strong className="text-offwhite">{activeCategoryName}</strong> : null}
            </p>
            <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red-light hover:text-white"><X className="h-3.5 w-3.5" /> Effacer les filtres</button>
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-charcoal-400/10 bg-charcoal-800/60" />)}
            </div>
          ) : failed ? (
            <div className="card py-16 text-center" role="alert">
              <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-brand-red" />
              <p className="text-charcoal-300">Impossible de charger les produits.</p>
              <button type="button" onClick={() => void loadProducts()} className="btn-ghost mx-auto mt-4"><RefreshCw className="h-4 w-4" /> Réessayer</button>
            </div>
          ) : products.length === 0 ? (
            <div className="card px-5 py-16 text-center">
              <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
              <h2 className="text-lg font-bold text-offwhite">Aucun produit trouvé</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-400">Essayez un autre mot-clé ou retirez les filtres pour voir toutes les créations disponibles.</p>
              <button type="button" onClick={resetFilters} className="btn-primary mt-5">Voir tous les produits</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {products.map((product) => <ProductCard key={product.id} product={product} imageUrl={primaryImage(product)} />)}
            </div>
          )}
        </div>

        <div className="mt-12 rounded-2xl border border-brand-red/20 bg-brand-red/5 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div><h2 className="text-lg font-bold text-offwhite">Vous avez une idée à fabriquer ?</h2><p className="mt-1 text-sm text-charcoal-400">Envoyez une image ou un modèle 3D à notre atelier.</p></div>
          <Link to="/boutique/sur-mesure" className="btn-secondary mt-4 shrink-0 border-brand-red/30 text-brand-red-light hover:bg-brand-red hover:text-white sm:mt-0">Demande sur mesure</Link>
        </div>
      </div>
    </div>
  )
}
