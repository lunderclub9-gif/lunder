import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowDownWideNarrow, ChevronLeft, ChevronRight, Package,
  RefreshCw, Search, SlidersHorizontal, X,
} from 'lucide-react'
import { supabase, type Product, type Category } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import { sanitizeSearchTerm } from '@/lib/format'
import posthog, { isPostHogEnabled } from '@/lib/posthog'

const PAGE_SIZE = 12

type SortOrder = 'newest' | 'price-asc' | 'price-desc'
type StockFilter = 'all' | 'in' | 'order'

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'newest', label: 'Plus récents' },
  { value: 'price-asc', label: 'Prix croissant' },
  { value: 'price-desc', label: 'Prix décroissant' },
]

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'in', label: 'En stock' },
  { value: 'order', label: 'Sur commande' },
]

const parseSort = (value: string | null): SortOrder =>
  value === 'price-asc' || value === 'price-desc' ? value : 'newest'

const parseStock = (value: string | null): StockFilter =>
  value === 'in' || value === 'order' ? value : 'all'

const parsePage = (value: string | null): number => {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [total, setTotal] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()

  const urlQuery = searchParams.get('q') ?? ''
  const urlCategorySlug = searchParams.get('c') ?? ''
  const sortOrder = parseSort(searchParams.get('sort'))
  const stock = parseStock(searchParams.get('stock'))
  const page = parsePage(searchParams.get('page'))

  const [search, setSearch] = useState(urlQuery)
  const [debouncedSearch, setDebouncedSearch] = useState(urlQuery)
  const [activeCategory, setActiveCategory] = useState('')
  const requestSequence = useRef(0)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
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

  useEffect(() => {
    setSearch((current) => (current === urlQuery ? current : urlQuery))
  }, [urlQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!urlCategorySlug) {
      setActiveCategory('')
      return
    }
    const match = categories.find((category) => category.slug === urlCategorySlug)
    if (match) setActiveCategory(match.id)
  }, [categories, urlCategorySlug])

  const updateParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const loadProducts = useCallback(async () => {
    const requestId = ++requestSequence.current
    setLoading(true)
    setFailed(false)

    let query = supabase
      .from('products')
      .select('*, category:categories(*), product_images(*)', { count: 'exact' })
      .eq('status', 'published')

    if (activeCategory) query = query.eq('category_id', activeCategory)
    if (stock === 'in') query = query.gt('stock_quantity', 0)
    if (stock === 'order') query = query.eq('made_to_order', true)

    const term = sanitizeSearchTerm(debouncedSearch)
    if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`)

    if (sortOrder === 'price-asc') query = query.order('price_dzd', { ascending: true }).order('id', { ascending: true })
    else if (sortOrder === 'price-desc') query = query.order('price_dzd', { ascending: false }).order('id', { ascending: true })
    else query = query.order('created_at', { ascending: false }).order('id', { ascending: false })

    const start = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query.range(start, start + PAGE_SIZE - 1)
    if (requestId !== requestSequence.current) return

    if (error) {
      console.error('[LUNDER] chargement des produits impossible', error.code ?? 'erreur inconnue')
      setProducts([])
      setTotal(0)
      setFailed(true)
      setLoading(false)
      return
    }

    setProducts((data as Product[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [activeCategory, debouncedSearch, page, sortOrder, stock])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const primaryImage = (product: Product) =>
    product.product_images?.find((image) => image.is_primary)?.image_url ??
    product.product_images?.[0]?.image_url

  const applyCategoryFilter = (category: Category | null) => {
    setActiveCategory(category?.id ?? '')
    updateParams({ c: category?.slug ?? null, page: null })
    if (isPostHogEnabled) {
      posthog.capture('product_filter_applied', {
        filter_type: category ? 'category' : 'all_products',
        category_id: category?.id || undefined,
      })
    }
  }

  const updateSearch = (value: string) => {
    setSearch(value)
    updateParams({ q: value.trim() ? value : null, page: null })
  }

  const resetFilters = () => {
    setSearch('')
    setActiveCategory('')
    setSearchParams({}, { replace: true })
  }

  const activeCategoryName = categories.find((category) => category.id === activeCategory)?.name
  const activeFilters = Boolean(urlQuery || urlCategorySlug || stock !== 'all')
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1)
    .reduce<number[]>((result, number) => {
      const previous = result[result.length - 1]
      if (previous && number - previous > 1) result.push(-1)
      result.push(number)
      return result
    }, [])

  return (
    <div className="min-h-screen">
      <section className="lz-hero">
        <div className="lz-container pb-9 pt-12 sm:pb-11">
          <p className="lz-eyebrow mb-3">LUNDER’S 3D STUDIO</p>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <h1 className="lz-display text-[clamp(2rem,4vw,3.25rem)]">La boutique</h1>
              <p className="lz-lead mt-3">
                Des pièces prêtes à imprimer, des objets utiles et des créations à personnaliser.
                Chaque fiche précise la matière, le délai et les options disponibles.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-charcoal-400/20 px-3.5 py-2 text-xs text-charcoal-300">
              <Package className="h-4 w-4 text-brand-red-light" />
              <span aria-live="polite">
                {loading ? 'Mise à jour du catalogue…' : `${total} création${total > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="lz-container py-8">
        <div className="lz-panel p-4 sm:p-5">
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
                <button
                  type="button"
                  onClick={() => updateSearch('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-charcoal-400 transition hover:bg-charcoal-700 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            <label className="relative block sm:w-56">
              <ArrowDownWideNarrow className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
              <select
                value={sortOrder}
                onChange={(event) => updateParams({ sort: event.target.value === 'newest' ? null : event.target.value, page: null })}
                className="input-field min-h-12 pl-10"
                aria-label="Trier les produits"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-charcoal-400/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {categories.length > 0 && (
              <div className="flex min-w-0 items-center gap-2">
                <span className="hidden shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal-500 sm:inline-flex">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Catégories
                </span>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin">
                  <button
                    type="button"
                    onClick={() => applyCategoryFilter(null)}
                    aria-pressed={!activeCategory}
                    className="lz-chip shrink-0"
                  >
                    Tout voir
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => applyCategoryFilter(category)}
                      aria-pressed={activeCategory === category.id}
                      className="lz-chip shrink-0"
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal-500">Stock</span>
              <div className="flex gap-1.5">
                {STOCK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateParams({ stock: option.value === 'all' ? null : option.value, page: null })}
                    aria-pressed={stock === option.value}
                    className="lz-chip px-3 py-1.5 text-[11px]"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {activeFilters && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-charcoal-300">
              {urlQuery ? <>Recherche <strong className="text-offwhite">« {urlQuery} »</strong></> : null}
              {urlQuery && (activeCategoryName || stock !== 'all') ? ' · ' : null}
              {activeCategoryName ? <strong className="text-offwhite">{activeCategoryName}</strong> : null}
              {activeCategoryName && stock !== 'all' ? ' · ' : null}
              {stock !== 'all' ? <strong className="text-offwhite">{STOCK_OPTIONS.find((option) => option.value === stock)?.label}</strong> : null}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red-light transition hover:text-offwhite"
            >
              <X className="h-3.5 w-3.5" /> Effacer les filtres
            </button>
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-charcoal-400/10 bg-charcoal-800/60" />
              ))}
            </div>
          ) : failed ? (
            <div className="lz-card px-5 py-16 text-center" role="alert">
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-brand-red" />
              <p className="text-charcoal-300">Impossible de charger les produits.</p>
              <button type="button" onClick={() => void loadProducts()} className="btn-ghost mx-auto mt-4">
                <RefreshCw className="h-4 w-4" /> Réessayer
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="lz-card px-5 py-16 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-charcoal-500" />
              <h2 className="text-lg font-bold text-offwhite">Aucun produit trouvé</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-400">
                Essayez un autre mot-clé, changez de catégorie ou retirez le filtre de disponibilité.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={resetFilters} className="btn-primary">Voir tous les produits</button>
                <Link to="/boutique/sur-mesure" className="btn-secondary">Faire fabriquer sur mesure</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} imageUrl={primaryImage(product)} />
                ))}
              </div>

              <nav aria-label="Pagination des produits" className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs text-charcoal-400">
                  {rangeStart}–{rangeEnd} sur {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateParams({ page: page > 2 ? String(page - 1) : null })}
                    disabled={page === 1}
                    className="btn-secondary min-h-10 min-w-10 px-3 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Page précédente"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {pageNumbers.map((number, index) =>
                    number === -1 ? (
                      <span key={`gap-${index}`} className="px-1 text-charcoal-500">…</span>
                    ) : (
                      <button
                        key={number}
                        type="button"
                        onClick={() => updateParams({ page: number === 1 ? null : String(number) })}
                        aria-current={number === page ? 'page' : undefined}
                        className={`flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition ${
                          number === page
                            ? 'border-transparent bg-brand-red text-white'
                            : 'border-charcoal-400/20 text-charcoal-300 hover:border-brand-red/40 hover:text-white'
                        }`}
                      >
                        {number}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => updateParams({ page: String(page + 1) })}
                    disabled={page >= totalPages}
                    className="btn-secondary min-h-10 min-w-10 px-3 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Page suivante"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </nav>
            </>
          )}
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-brand-red/20 bg-brand-red/[0.06] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-lg font-bold text-offwhite">Vous avez une idée à fabriquer ?</h2>
            <p className="mt-1 text-sm text-charcoal-400">
              Envoyez un modèle 3D, une image ou une description : l’atelier vous répond avec une estimation.
            </p>
          </div>
          <Link to="/boutique/sur-mesure" className="btn-secondary mt-4 shrink-0 border-brand-red/30 text-brand-red-light hover:bg-brand-red hover:text-white sm:mt-0">
            Demande sur mesure
          </Link>
        </div>
      </div>
    </div>
  )
}
