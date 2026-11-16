import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Package, Loader2, ShoppingCart, ShieldCheck, Truck, AlertTriangle, Minus, Plus } from 'lucide-react'
import {
  supabase,
  type Product,
  type ProductImage,
  type ProductOption,
  type ProductVariant,
} from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import Viewer3D from '@/components/Viewer3D'
import { useCart } from '@/lib/cart'

export default function ProductDetailPage() {
  const { slug } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [options, setOptions] = useState<ProductOption[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeImage, setActiveImage] = useState<string | null>(null)
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const { add } = useCart()

  useEffect(() => {
    if (!product) return
    document.title = `${product.name} | LUNDER'S 3D STUDIO`
    return () => { document.title = "LUNDER'S 3D STUDIO" }
  }, [product])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    setProduct(null)
    setImages([])
    setOptions([])
    setVariants([])
    setSelection({})
    setQuantity(1)
    setActiveImage(null)

    if (!slug) {
      setLoading(false)
      return () => { active = false }
    }

    void (async () => {
      try {
        const { data, error: productError } = await supabase
          .from('products')
          .select('*, category:categories(*)')
          .eq('slug', slug)
          .eq('status', 'published')
          .maybeSingle()

        if (!active) return
        if (productError) throw productError
        if (!data) {
          setLoading(false)
          return
        }

        const p = data as Product
        const [imagesResult, optionsResult, variantsResult] = await Promise.all([
          supabase.from('product_images').select('*').eq('product_id', p.id).order('sort_order'),
          supabase
            .from('product_options')
            .select('*, values:product_option_values(*)')
            .eq('product_id', p.id)
            .order('sort_order'),
          supabase
            .from('product_variants')
            .select('*, values:product_variant_values(option_value_id)')
            .eq('product_id', p.id)
            .eq('is_active', true),
        ])

        if (!active) return
        if (imagesResult.error || optionsResult.error || variantsResult.error) {
          throw imagesResult.error ?? optionsResult.error ?? variantsResult.error
        }

        const imgList = (imagesResult.data as ProductImage[]) ?? []
        setImages(imgList)
        const primary = imgList.find((i) => i.is_primary) ?? imgList[0]
        setActiveImage(primary?.image_url ?? null)

        const optionList = ((optionsResult.data as ProductOption[]) ?? []).map((option) => ({
          ...option,
          values: [...(option.values ?? [])]
            .filter((value) => value.is_active)
            .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value)),
        }))
        setOptions(optionList)
        setVariants((variantsResult.data as ProductVariant[]) ?? [])

        const initial: Record<string, string> = {}
        optionList.forEach((option) => {
          const first = option.values?.[0]
          if (first) initial[option.id] = first.id
        })
        setSelection(initial)
        setProduct(p)
        setLoading(false)
      } catch (error) {
        console.error('[LUNDER] chargement du produit impossible', error)
        if (active) {
          setLoadError(true)
          setLoading(false)
        }
      }
    })()

    return () => { active = false }
  }, [slug])

  const selectableOptions = useMemo(
    () => options.filter((option) => (option.values ?? []).length > 0),
    [options]
  )

  const matchedVariant = useMemo(() => {
    if (selectableOptions.length === 0) return null
    const chosen = selectableOptions.map((option) => selection[option.id])
    if (chosen.some((valueId) => !valueId)) return null

    return (
      variants.find((variant) => {
        const valueIds = (variant.values ?? []).map((item) => item.option_value_id)
        return valueIds.length === chosen.length && chosen.every((valueId) => valueIds.includes(valueId))
      }) ?? null
    )
  }, [selectableOptions, selection, variants])

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
        {loadError ? <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-brand-red" /> : <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />}
        <h1 className="text-xl font-semibold text-offwhite">{loadError ? 'Chargement impossible' : 'Produit introuvable'}</h1>
        <p className="mt-2 text-sm text-charcoal-400">{loadError ? 'Une erreur est survenue pendant le chargement de ce produit. Vérifiez votre connexion et réessayez.' : 'Ce produit n’est peut-être plus disponible.'}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {loadError && <button type="button" onClick={() => window.location.reload()} className="btn-secondary">Réessayer</button>}
          <Link to="/boutique/produits" className="btn-primary">
            <ArrowLeft className="h-4 w-4" />
            Retour à la boutique
          </Link>
        </div>
      </div>
    )
  }

  const madeToOrder = matchedVariant?.made_to_order ?? product.made_to_order
  const stockQuantity = matchedVariant ? matchedVariant.stock_quantity : product.stock_quantity
  const displayPrice = matchedVariant?.price_dzd ?? product.price_dzd
  const combinationAvailable = selectableOptions.length === 0 || matchedVariant !== null
  const inStock = combinationAvailable && (madeToOrder || stockQuantity > 0)
  const maxQuantity = madeToOrder ? 10 : Math.min(10, Math.max(1, stockQuantity))

  const selectedVariantLabel = matchedVariant
    ? matchedVariant.label ??
      selectableOptions
        .map((option) => option.values?.find((value) => value.id === selection[option.id])?.value)
        .filter(Boolean)
        .join(' / ') ??
      null
    : null

  const handleAddToCart = () => {
    if (!product || !inStock) return
    add({
      productId: product.id,
      variantId: matchedVariant?.id ?? null,
      slug: product.slug,
      name: product.name,
      variantLabel: selectedVariantLabel || null,
      unitPriceDzd: displayPrice,
      imageUrl: activeImage,
    }, quantity)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 3000)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-charcoal-500">
        <Link to="/boutique" className="transition hover:text-offwhite">Accueil</Link><span>/</span>
        <Link to="/boutique/produits" className="transition hover:text-offwhite">Boutique</Link><span>/</span>
        <span className="max-w-[14rem] truncate text-charcoal-300">{product.name}</span>
      </div>
      <Link to="/boutique/produits" className="btn-ghost mb-5">
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <div className="space-y-4">
          {product.model_url ? (
            <Viewer3D src={product.model_url} poster={activeImage ?? undefined} alt={product.name} />
          ) : activeImage ? (
            <div className="aspect-square overflow-hidden rounded-3xl border border-charcoal-400/15 bg-charcoal-800 shadow-2xl shadow-black/20">
              <img src={activeImage} alt={product.name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-3xl border border-charcoal-400/15 bg-charcoal-800">
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
                  <img
                    src={img.image_url}
                    alt={img.alt_text ?? ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          <div className="rounded-3xl border border-charcoal-400/15 bg-gradient-to-br from-charcoal-800/90 to-charcoal-950/80 p-5 sm:p-7">
            <div className="mb-4 text-[10px] font-bold tracking-[0.2em] text-brand-red-light">LUNDER'S 3D STUDIO · CRÉATION & DESIGN</div>
            {product.category && (
              <span className="text-xs font-medium tracking-wide text-brand-red uppercase">
                {product.category.name}
              </span>
            )}
            <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight text-offwhite sm:text-4xl">{product.name}</h1>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-3xl font-black tracking-tight text-offwhite">{formatDzd(displayPrice)}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  inStock ? 'bg-green-600/20 text-green-400' : 'bg-brand-red/20 text-brand-red-light'
                }`}
              >
                {!combinationAvailable ? 'Combinaison indisponible' : madeToOrder ? 'Sur commande' : inStock ? 'En stock' : 'Épuisé'}
              </span>
            </div>
          </div>

          {product.description && (
            <div className="text-sm leading-relaxed text-charcoal-300 whitespace-pre-line">
              {product.description}
            </div>
          )}

          {selectableOptions.map((option) => (
            <div key={option.id}>
              <h3 className="mb-2 text-sm font-semibold text-offwhite">{option.name}</h3>
              <div className="flex flex-wrap gap-2">
                {(option.values ?? []).map((value) => (
                  <button
                    key={value.id}
                    onClick={() => setSelection((prev) => ({ ...prev, [option.id]: value.id }))}
                    aria-pressed={selection[option.id] === value.id}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      selection[option.id] === value.id
                        ? 'border-brand-red bg-brand-red/10 text-brand-red-light'
                        : 'border-charcoal-400/20 text-charcoal-300 hover:border-charcoal-300'
                    }`}
                  >
                    {value.value}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {selectableOptions.length === 0 && product.available_colors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-offwhite">Couleurs disponibles</h3>
              <div className="flex flex-wrap gap-2">
                {product.available_colors.map((color) => (
                  <span key={color} className="rounded-full border border-charcoal-400/20 bg-charcoal-800 px-3 py-1.5 text-xs font-medium text-charcoal-200">
                    {color}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-charcoal-500">La couleur souhaitée peut être confirmée avec l’atelier avant fabrication.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-charcoal-400/15 bg-charcoal-800/50 p-5">
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

          <div className="flex flex-col gap-2">
            {inStock && (
              <div className="flex items-center justify-between rounded-xl border border-charcoal-400/15 bg-charcoal-800/50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-offwhite">Quantité</p>
                  <p className="text-xs text-charcoal-500">Maximum {maxQuantity} par commande</p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Diminuer la quantité" className="flex h-10 w-10 items-center justify-center rounded-lg border border-charcoal-400/20 text-charcoal-200 transition hover:border-brand-red disabled:cursor-not-allowed disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                  <span className="min-w-5 text-center text-sm font-bold tabular-nums text-offwhite" aria-live="polite">{quantity}</span>
                  <button type="button" onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={quantity >= maxQuantity} aria-label="Augmenter la quantité" className="flex h-10 w-10 items-center justify-center rounded-lg border border-charcoal-400/20 text-charcoal-200 transition hover:border-brand-red disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!inStock}
                className="btn-primary flex-1"
              >
                <ShoppingCart className="h-4 w-4" />
                {inStock ? 'Ajouter au panier' : combinationAvailable ? 'Indisponible' : 'Combinaison indisponible'}
              </button>
              <Link to="/boutique/panier" className="btn-secondary">
                Voir le panier
              </Link>
            </div>
            {added && (
              <p role="status" className="text-sm text-green-400">
                Ajouté au panier.
              </p>
            )}
          </div>

          <div className="grid gap-3 rounded-2xl border border-charcoal-400/15 bg-charcoal-800/30 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /><p className="text-xs leading-5 text-charcoal-300">Paiement à la livraison, sans carte bancaire.</p></div>
            <div className="flex items-start gap-2.5"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" /><p className="text-xs leading-5 text-charcoal-300">Livraison à domicile ou point relais selon votre wilaya.</p></div>
          </div>
        </div>
      </div>
    </div>
  )
}
