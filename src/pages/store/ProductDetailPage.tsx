import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Package, Loader2, ShoppingCart, Check, ChevronLeft, ChevronRight, Maximize2, X, Image as ImageIcon, Box } from 'lucide-react'
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
import { setPageSeo } from '@/lib/seo'

export default function ProductDetailPage() {
  const { slug } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [options, setOptions] = useState<ProductOption[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [activeImage, setActiveImage] = useState<string | null>(null)
  const [mediaMode, setMediaMode] = useState<'photos' | '3d'>('photos')
  const [imageFullscreen, setImageFullscreen] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [added, setAdded] = useState(false)
  const { add } = useCart()

  useEffect(() => {
    if (!slug) return
    ;(async () => {
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

      const [{ data: imgs }, { data: opts }, { data: vars }] = await Promise.all([
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

      const imgList = (imgs as ProductImage[]) ?? []
      setImages(imgList)
      const primary = imgList.find((i) => i.is_primary) ?? imgList[0]
      setActiveImage(primary?.image_url ?? null)
      setMediaMode(imgList.length > 0 ? 'photos' : p.model_url ? '3d' : 'photos')

      const optionList = ((opts as ProductOption[]) ?? []).map((option) => ({
        ...option,
        values: [...(option.values ?? [])]
          .filter((value) => value.is_active)
          .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value)),
      }))
      setOptions(optionList)
      setVariants((vars as ProductVariant[]) ?? [])

      // Let the customer choose each option in sequence; never preselect a value.
      setSelection({})

      if (p.available_colors.length > 0) setSelectedColor(p.available_colors[0])
      setLoading(false)
    })()
  }, [slug])

  useEffect(() => {
    if (!product) return
    const description = product.seo_description?.trim() || product.description?.trim() || `${product.name} — disponible chez LUNDER'S 3D STUDIO en Algérie.`
    const image = images.find((item) => item.is_primary)?.image_url ?? images[0]?.image_url ?? undefined
    setPageSeo({
      title: product.seo_title?.trim() || `${product.name} | LUNDER'S 3D STUDIO`,
      description,
      keywords: product.seo_keywords ?? [],
      canonicalUrl: `${window.location.origin}/boutique/produits/${encodeURIComponent(product.slug)}`,
      imageUrl: image,
      type: 'product',
    })
  }, [product, images])

  const selectableOptions = useMemo(
    () => options.filter((option) => (option.values ?? []).length > 0),
    [options]
  )

  // Options are presented progressively: choose the first option (e.g. Forme),
  // then only values belonging to real variants matching the previous choices.
  const nextOptionIndex = selectableOptions.findIndex((option) => !selection[option.id])
  const visibleOptionCount = nextOptionIndex === -1 ? selectableOptions.length : nextOptionIndex + 1

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

  const isOptionValueAvailable = (optionIndex: number, valueId: string) => {
    const required = selectableOptions
      .slice(0, optionIndex)
      .map((option) => selection[option.id])
      .filter(Boolean)
    return variants.some((variant) => {
      const ids = (variant.values ?? []).map((item) => item.option_value_id)
      return ids.includes(valueId) && required.every((selectedId) => ids.includes(selectedId))
    })
  }

  const selectOptionValue = (optionIndex: number, valueId: string) => {
    const option = selectableOptions[optionIndex]
    setSelection((previous) => {
      const next = { ...previous, [option.id]: valueId }
      selectableOptions.slice(optionIndex + 1).forEach((laterOption) => delete next[laterOption.id])
      return next
    })
  }

  useEffect(() => {
    if (!product) return
    if (matchedVariant?.image_url) {
      setActiveImage(matchedVariant.image_url)
      setMediaMode('photos')
      return
    }
    const selectedOptionImage = [...selectableOptions]
      .reverse()
      .map((option) => option.values?.find((value) => value.id === selection[option.id])?.image_url)
      .find(Boolean)
    if (selectedOptionImage) {
      setActiveImage(selectedOptionImage)
      setMediaMode('photos')
      return
    }
    const primary = images.find((image) => image.is_primary) ?? images[0]
    setActiveImage(primary?.image_url ?? null)
  }, [matchedVariant?.id, matchedVariant?.image_url, product?.id, images, selection, selectableOptions])

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

  const madeToOrder = matchedVariant?.made_to_order ?? product.made_to_order
  const stockQuantity = matchedVariant ? matchedVariant.stock_quantity : product.stock_quantity
  const displayPrice = matchedVariant?.price_dzd ?? product.price_dzd
  const allOptionsSelected = selectableOptions.every((option) => Boolean(selection[option.id]))
  const combinationAvailable = selectableOptions.length === 0 || (allOptionsSelected && matchedVariant !== null)
  const inStock = combinationAvailable && (madeToOrder || stockQuantity > 0)

  const selectedVariantLabel = matchedVariant
    ? matchedVariant.label ??
      selectableOptions
        .map((option) => `${option.name}: ${option.values?.find((value) => value.id === selection[option.id])?.value ?? ''}`)
        .filter(Boolean)
        .join(' · ') ??
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
    })
    setAdded(true)
    window.setTimeout(() => setAdded(false), 3000)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/boutique/produits" className="btn-ghost mb-6">
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          {product.model_url && images.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-charcoal-400/15 bg-charcoal-800/60 p-1" role="group" aria-label="Mode d’affichage du produit">
              <button type="button" onClick={() => setMediaMode('photos')} aria-pressed={mediaMode === 'photos'} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mediaMode === 'photos' ? 'bg-brand-red text-white' : 'text-charcoal-300 hover:text-white'}`}>
                <ImageIcon className="h-4 w-4" /> Photos
              </button>
              <button type="button" onClick={() => setMediaMode('3d')} aria-pressed={mediaMode === '3d'} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mediaMode === '3d' ? 'bg-brand-red text-white' : 'text-charcoal-300 hover:text-white'}`}>
                <Box className="h-4 w-4" /> Vue 3D
              </button>
            </div>
          )}

          {mediaMode === '3d' && product.model_url ? (
            <Viewer3D src={product.model_url} poster={activeImage ?? undefined} alt={product.name} />
          ) : activeImage ? (
            <div className="group relative aspect-square overflow-hidden rounded-xl border border-charcoal-400/15 bg-charcoal-800">
              <img src={activeImage} alt={product.name} className="h-full w-full object-contain" />
              {images.length > 1 && (
                <>
                  <button type="button" onClick={() => { const index = images.findIndex((img) => img.image_url === activeImage); setActiveImage(images[(index - 1 + images.length) % images.length].image_url) }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/65 p-2 text-white" aria-label="Photo précédente"><ChevronLeft className="h-5 w-5" /></button>
                  <button type="button" onClick={() => { const index = images.findIndex((img) => img.image_url === activeImage); setActiveImage(images[(index + 1) % images.length].image_url) }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/65 p-2 text-white" aria-label="Photo suivante"><ChevronRight className="h-5 w-5" /></button>
                </>
              )}
              <button type="button" onClick={() => setImageFullscreen(true)} className="absolute bottom-3 right-3 rounded-lg bg-black/65 p-2 text-white" aria-label="Agrandir la photo"><Maximize2 className="h-4 w-4" /></button>
            </div>
          ) : product.model_url ? (
            <Viewer3D src={product.model_url} alt={product.name} />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-xl border border-charcoal-400/15 bg-charcoal-800">
              <Package className="h-12 w-12 text-charcoal-600" />
            </div>
          )}

          {images.length > 0 && mediaMode === 'photos' && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {images.map((img) => (
                <button key={img.id} type="button" onClick={() => setActiveImage(img.image_url)} aria-label={`Afficher ${img.alt_text || 'la photo'}`} aria-pressed={activeImage === img.image_url} className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${activeImage === img.image_url ? 'border-brand-red' : 'border-transparent hover:border-charcoal-400'}`}>
                  <img src={img.image_url} alt={img.alt_text ?? product.name} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {imageFullscreen && activeImage && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4" role="dialog" aria-modal="true" aria-label="Aperçu de la photo" onClick={() => setImageFullscreen(false)}>
              <button type="button" onClick={() => setImageFullscreen(false)} className="absolute right-4 top-4 rounded-full bg-charcoal-800 p-3 text-white" aria-label="Fermer l’aperçu"><X className="h-5 w-5" /></button>
              <img src={activeImage} alt={product.name} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
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
              <span className="text-2xl font-bold text-offwhite">{formatDzd(displayPrice)}</span>
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

          {selectableOptions.slice(0, visibleOptionCount).map((option, optionIndex) => {
            const availableValues = (option.values ?? []).filter((value) =>
              isOptionValueAvailable(optionIndex, value.id)
            )
            return (
              <div key={option.id} className="rounded-xl border border-charcoal-400/15 bg-charcoal-800/30 p-4">
                <h3 className="mb-2 text-sm font-semibold text-offwhite">
                  {optionIndex + 1}. {option.name}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {availableValues.map((value) => (
                    <button
                      key={value.id}
                      type="button"
                      onClick={() => selectOptionValue(optionIndex, value.id)}
                      aria-pressed={selection[option.id] === value.id}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        selection[option.id] === value.id
                          ? 'border-brand-red bg-brand-red/10 text-brand-red-light'
                          : 'border-charcoal-400/20 text-charcoal-300 hover:border-charcoal-300'
                      }`}
                    >
                      {value.image_url && <img src={value.image_url} alt="" className="mb-1 h-10 w-10 rounded-md object-cover" />}
                      {value.value}
                    </button>
                  ))}
                  {availableValues.length === 0 && (
                    <p className="text-xs text-charcoal-400">Aucune valeur disponible pour cette sélection.</p>
                  )}
                </div>
              </div>
            )
          })}

          {selectableOptions.length === 0 && product.available_colors.length > 0 && (
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

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!inStock || (selectableOptions.length > 0 && !allOptionsSelected)}
                className="btn-primary flex-1"
              >
                <ShoppingCart className="h-4 w-4" />
                {!allOptionsSelected && selectableOptions.length > 0 ? 'Choisissez les options' : inStock ? 'Ajouter au panier' : combinationAvailable ? 'Indisponible' : 'Combinaison indisponible'}
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
