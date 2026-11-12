import { useEffect, useState } from 'react'
import { Package, Search } from 'lucide-react'
import { supabase, type Product, type Category } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import { sanitizeSearchTerm } from '@/lib/format'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('')

  useEffect(() => {
    (async () => {
      const { data: cats } = await supabase.from('categories').select('*').eq('is_active', true).order('name')
      setCategories((cats as Category[]) ?? [])
    })()
  }, [])

  useEffect(() => {
    loadProducts()
  }, [activeCategory, search])

  const loadProducts = async () => {
    setLoading(true)
    let query = supabase
      .from('products')
      .select('*, category:categories(*), product_images(*)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (activeCategory) {
      query = query.eq('category_id', activeCategory)
    }
    // La saisie est nettoyée : sans cela, une virgule ou une parenthèse
    // injecterait de la syntaxe dans le filtre PostgREST.
    const term = sanitizeSearchTerm(search)
    if (term) {
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`)
    }

    const { data } = await query
    setProducts((data as Product[]) ?? [])
    setLoading(false)
  }

  const primaryImage = (p: Product) => p.product_images?.find((img) => img.is_primary)?.image_url ?? p.product_images?.[0]?.image_url

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-3xl font-bold text-offwhite">Boutique</h1>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
          <input
            type="text"
            placeholder="Rechercher un produit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !activeCategory ? 'bg-brand-red text-white' : 'bg-charcoal-800 text-charcoal-300 hover:text-offwhite'
            }`}
          >
            Toutes
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.id ? 'bg-brand-red text-white' : 'bg-charcoal-800 text-charcoal-300 hover:text-offwhite'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Package className="h-8 w-8 animate-pulse text-charcoal-500" />
        </div>
      ) : products.length === 0 ? (
        <div className="card text-center py-16">
          <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">Aucun produit trouvé.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} imageUrl={primaryImage(p)} />
          ))}
        </div>
      )}
    </div>
  )
}
