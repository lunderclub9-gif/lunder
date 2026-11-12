import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Package, Loader2, ShoppingCart, Check } from 'lucide-react'
import { supabase, type Product, type ProductImage } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import Viewer3D from '@/components/Viewer3D'

export default function ProductDetailPage() {
  const { slug } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeImage, setActiveImage] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('products')
        .select('*, category:categories(*)')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()

      if (!data) {
        setLoading(false)
        return
      }

      const p = data as Product
      setProduct(p)

      const { data: imgs } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', p.id)
        .order('sort_order')
      const imgList = (imgs as ProductImage[]) ?? []
      setImages(imgList)
      const primary = imgList.find((i) => i.is_primary) ?? imgList[0]
      setActiveImage(primary?.image_url ?? null)
      if (p.available_colors.length > 0) setSelectedColor(p.available_colors[0])
      setLoading(false)
    })()
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
        <h1 className="text-xl font-semibold text-offwhite">Produit introuvable</h1>
        <Link to="/boutique/produits" className="btn-primary mt-6">
          <ArrowLeft className="h-4 w-4" />
          Retour à la boutique
        </Link>
      </div>
    )
  }

  const inStock = product.made_to_order || product.stock_quantity > 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/boutique/produits" className="btn-ghost mb-6">
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          {product.model_url ? (
            <Viewer3D src={product.model_url} poster={activeImage ?? undefined} alt={product.name} />
          ) : activeImage ? (
            <div className="aspect-square overflow-hidden rounded-xl border border-charcoal-400/15 bg-charcoal-800">
              <img src={activeImage} alt={product.name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-xl border border-charcoal-400/15 bg-charcoal-800">
              <Package className="h-12 w-12 text-charcoal-600" />
            </div>
          )}

          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(img.image_url)}
                  className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                    activeImage === img.image_url ? 'border-brand-red' : 'border-transparent hover:border-charcoal-400'
                  }`}
                >
                  <img src={img.image_url} alt={img.alt_text ?? ''} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            {product.category && (
              <span className="text-xs font-medium tracking-wide text-brand-red uppercase">
                {product.category.name}
              </span>
            )}
            <h1 className="mt-1 text-3xl font-bold text-offwhite">{product.name}</h1>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-2xl font-bold text-offwhite">{formatDzd(product.price_dzd)}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  inStock ? 'bg-green-600/20 text-green-400' : 'bg-brand-red/20 text-brand-red-light'
                }`}
              >
                {product.made_to_order ? 'Sur commande' : inStock ? 'En stock' : 'Épuisé'}
              </span>
            </div>
          </div>

          {product.description && (
            <div className="text-sm leading-relaxed text-charcoal-300 whitespace-pre-line">
              {product.description}
            </div>
          )}

          {product.available_colors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-offwhite">Couleurs disponibles</h3>
              <div className="flex flex-wrap gap-2">
                {product.available_colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      selectedColor === color
                        ? 'border-brand-red bg-brand-red/10 text-brand-red-light'
                        : 'border-charcoal-400/20 text-charcoal-300 hover:border-charcoal-300'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 rounded-xl border border-charcoal-400/15 bg-charcoal-800/50 p-4">
            {product.material && (
              <div>
                <span className="text-xs text-charcoal-400">Matière</span>
                <p className="text-sm font-medium text-offwhite">{product.material}</p>
              </div>
            )}
            {product.dimensions && (
              <div>
                <span className="text-xs text-charcoal-400">Dimensions</span>
                <p className="text-sm font-medium text-offwhite">{product.dimensions}</p>
              </div>
            )}
            {product.weight_g && (
              <div>
                <span className="text-xs text-charcoal-400">Poids</span>
                <p className="text-sm font-medium text-offwhite">{product.weight_g} g</p>
              </div>
            )}
            {product.production_lead_days != null && (
              <div>
                <span className="text-xs text-charcoal-400">Délai de production</span>
                <p className="text-sm font-medium text-offwhite">{product.production_lead_days} jours</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button disabled={!inStock} className="btn-primary flex-1">
              <ShoppingCart className="h-4 w-4" />
              {inStock ? 'Ajouter au panier' : 'Indisponible'}
            </button>
          </div>

          <div className="rounded-xl border border-charcoal-400/15 bg-charcoal-800/30 p-4">
            <div className="flex items-start gap-3">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
              <p className="text-xs text-charcoal-300">
                Paiement à la livraison disponible partout en Algérie. Livraison à domicile et points relais.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
