import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Box, CheckCircle2, Clock3, Layers, Loader2, Minus, Package,
  Plus, Rotate3D, Ruler, ShieldCheck, ShoppingCart, Truck, AlertTriangle,
  Weight, Palette, ChevronRight,
} from 'lucide-react'
import {
  supabase,
  type Product,
  type ProductImage,
  type ProductOption,
  type ProductVariant,
} from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { recordRecentlyViewed } from '@/lib/recently-viewed'
import Viewer3D from '@/components/Viewer3D'
import WishlistButton from '@/components/store/WishlistButton'
import RecentlyViewedProducts from '@/components/store/RecentlyViewedProducts'
import { useCart } from '@/lib/cart'

const MAX_PER_ORDER = 10

export default function ProductDetailPage() {
  const { slug } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [options, setOptions] = useState<ProductOption[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeImage, setActiveImage] = useState<string | null>(null)
  const [view, setView] = useState<'images' | 'model'>('images')
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const { add, items } = useCart()

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
    setView('images')

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
        const variantList = (variantsResult.data as ProductVariant[]) ?? []
        setOptions(optionList)
        setVariants(variantList)

        // Sélection initiale : la première valeur qui mène à une combinaison
        // réellement disponible, pas simplement la première de la liste.
        const initial: Record<string, string> = {}
        optionList.forEach((option) => {
          const firstAvailable = option.values?.find((value) =>
            variantList.length === 0 || variantList.some((variant) => {
              const available = (variant.made_to_order ?? p.made_to_order) || variant.stock_quantity > 0
              return available && (variant.values ?? []).some((item) => item.option_value_id === value.id)
            })
          )
          const value = firstAvailable ?? option.values?.[0]
          if (value) initial[option.id] = value.id
        })
        setSelection(initial)
        setProduct(p)
        setLoading(false)

        recordRecentlyViewed({
          id: p.id,
          slug: p.slug,
          name: p.name,
          priceDzd: p.price_dzd,
          imageUrl: primary?.image_url ?? null,
        })
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

  const madeToOrder = matchedVariant?.made_to_order ?? product?.made_to_order ?? false
  const stockQuantity = matchedVariant ? matchedVariant.stock_quantity : (product?.stock_quantity ?? 0)
  const displayPrice = matchedVariant?.price_dzd ?? product?.price_dzd ?? 0
  const combinationAvailable = selectableOptions.length === 0 || matchedVariant !== null
  const inStock = combinationAvailable && (madeToOrder || stockQuantity > 0)
  const maxQuantity = madeToOrder ? MAX_PER_ORDER : Math.min(MAX_PER_ORDER, Math.max(1, stockQuantity))

  /** Une valeur n'est proposée que si elle mène à une combinaison disponible. */
  const canSelectValue = (optionId: string, valueId: string) => {
    if (variants.length === 0 || !product) return true
    const required = selectableOptions
      .filter((option) => option.id !== optionId)
      .map((option) => selection[option.id])
      .filter(Boolean)
    return variants.some((variant) => {
      const available = (variant.made_to_order ?? product.made_to_order) || variant.stock_quantity > 0
      if (!available) return false
      const valueIds = (variant.values ?? []).map((item) => item.option_value_id)
      return valueIds.includes(valueId) && required.every((id) => valueIds.includes(id))
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="lz-container py-24 text-center">
        {loadError ? <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-brand-red" /> : <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />}
        <h1 className="text-xl font-semibold text-offwhite">{loadError ? 'Chargement impossible' : 'Produit introuvable'}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-charcoal-400">
          {loadError
            ? 'Une erreur est survenue pendant le chargement de ce produit. Vérifiez votre connexion et réessayez.'
            : 'Ce produit n’est peut-être plus disponible ou son adresse a changé.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {loadError && (
            <button type="button" onClick={() => window.location.reload()} className="btn-secondary">Réessayer</button>
          )}
          <Link to="/boutique/produits" className="btn-primary">
            <ArrowLeft className="h-4 w-4" /> Retour à la boutique
          </Link>
        </div>
      </div>
    )
  }

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
    window.setTimeout(() => setAdded(false), 3200)
  }

  const specs = [
    product.material ? { icon: Layers, label: 'Matière', value: product.material } : null,
    product.dimensions ? { icon: Ruler, label: 'Dimensions', value: product.dimensions } : null,
    product.weight_g ? { icon: Weight, label: 'Poids', value: `${product.weight_g} g` } : null,
    product.production_lead_days != null
      ? { icon: Clock3, label: 'Délai de fabrication', value: `${product.production_lead_days} jours` }
      : null,
    product.available_colors.length > 0
      ? { icon: Palette, label: 'Couleurs', value: product.available_colors.join(', ') }
      : null,
  ].filter((spec): spec is { icon: typeof Layers; label: string; value: string } => spec !== null)

  const hasModel = Boolean(product.model_url)
  const showModel = hasModel && view === 'model'
  const inCart = items.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0)

  return (
    <div>
      <div className="lz-container pt-6">
        <nav aria-label="Fil d’Ariane" className="flex flex-wrap items-center gap-1.5 text-[11px] text-charcoal-500">
          <Link to="/boutique" className="transition hover:text-offwhite">Accueil</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/boutique/produits" className="transition hover:text-offwhite">Boutique</Link>
          {product.category && (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link to={`/boutique/produits?c=${encodeURIComponent(product.category.slug)}`} className="transition hover:text-offwhite">
                {product.category.name}
              </Link>
            </>
          )}
          <ChevronRight className="h-3 w-3" />
          <span className="max-w-[12rem] truncate text-charcoal-300">{product.name}</span>
        </nav>
      </div>

      <div className="lz-container py-7 lg:py-10">
        <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          {/* ------------------------------------------------------- MEDIA */}
          <div className="space-y-3">
            {hasModel && (
              <div className="inline-flex rounded-lg border border-charcoal-400/20 bg-charcoal-900/60 p-1" role="tablist" aria-label="Modes d’affichage">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showModel}
                  onClick={() => setView('images')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${!showModel ? 'bg-brand-red text-white' : 'text-charcoal-300 hover:text-white'}`}
                >
                  <Package className="h-3.5 w-3.5" /> Photos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showModel}
                  onClick={() => setView('model')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${showModel ? 'bg-brand-red text-white' : 'text-charcoal-300 hover:text-white'}`}
                >
                  <Rotate3D className="h-3.5 w-3.5" /> 3D
                </button>
              </div>
            )}

            {showModel && product.model_url ? (
              <Viewer3D src={product.model_url} poster={activeImage ?? undefined} alt={product.name} />
            ) : activeImage ? (
              <div className="lz-stage overflow-hidden">
                <div className="relative aspect-square">
                  <img src={activeImage} alt={product.name} className="h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-charcoal-950/60 to-transparent" />
                  {product.is_featured && (
                    <span className="lz-badge lz-badge-signal absolute left-4 top-4">Sélection LUNDER</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="lz-stage flex aspect-square items-center justify-center">
                <Box className="h-16 w-16 text-charcoal-500" strokeWidth={1.1} />
              </div>
            )}

            {images.length > 1 && !showModel && (
              <div className="grid grid-cols-5 gap-2">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      setActiveImage(img.image_url)
                      setView('images')
                    }}
                    aria-label={img.alt_text ?? `Voir la photo ${product.name}`}
                    aria-pressed={activeImage === img.image_url}
                    className={`aspect-square overflow-hidden rounded-lg border-2 transition ${
                      activeImage === img.image_url
                        ? 'border-brand-red'
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={img.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="hidden gap-2 pt-1 sm:grid sm:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 p-3.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-[11px] leading-5 text-charcoal-400">Paiement en espèces à la réception, sans carte bancaire.</p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 p-3.5">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" />
                <p className="text-[11px] leading-5 text-charcoal-400">Livraison à domicile ou en point relais selon votre wilaya.</p>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------- PURCHASE */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {product.category && (
                  <Link
                    to={`/boutique/produits?c=${encodeURIComponent(product.category.slug)}`}
                    className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-red-light hover:text-white"
                  >
                    {product.category.name}
                  </Link>
                )}
                <span className="text-charcoal-600">·</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-charcoal-500">Création LUNDER</span>
              </div>

              <h1 className="mt-3 text-[clamp(1.7rem,3.4vw,2.6rem)] font-black leading-[1.1] tracking-[-0.03em] text-offwhite">
                {product.name}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-[1.75rem] font-black tracking-tight text-offwhite">{formatDzd(displayPrice)}</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    inStock
                      ? madeToOrder
                        ? 'bg-amber-400/10 text-amber-300'
                        : 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-brand-red/10 text-brand-red-light'
                  }`}
                >
                  {inStock ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {!combinationAvailable
                    ? 'Combinaison indisponible'
                    : madeToOrder
                      ? 'Fabriqué sur commande'
                      : inStock
                        ? 'En stock'
                        : 'Épuisé'}
                </span>
              </div>

              {product.description && (
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-charcoal-300">{product.description}</p>
              )}
            </div>

            {selectableOptions.length > 0 && (
              <div className="space-y-4 border-t border-charcoal-400/10 pt-5">
                {selectableOptions.map((option) => (
                  <fieldset key={option.id}>
                    <legend className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-charcoal-400">
                      {option.name}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {(option.values ?? []).map((value) => {
                        const selectable = canSelectValue(option.id, value.id)
                        const selected = selection[option.id] === value.id
                        return (
                          <button
                            key={value.id}
                            type="button"
                            disabled={!selectable}
                            aria-pressed={selected}
                            title={selectable ? undefined : 'Combinaison indisponible'}
                            onClick={() => setSelection((prev) => ({ ...prev, [option.id]: value.id }))}
                            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                              selected
                                ? 'border-brand-red bg-brand-red/10 text-brand-red-light'
                                : selectable
                                  ? 'border-charcoal-400/20 text-charcoal-200 hover:border-brand-red/50 hover:text-white'
                                  : 'cursor-not-allowed border-charcoal-400/10 text-charcoal-500 line-through'
                            }`}
                          >
                            {value.value}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}

            {selectableOptions.length === 0 && product.available_colors.length > 0 && (
              <div className="border-t border-charcoal-400/10 pt-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-charcoal-400">Couleurs disponibles</h2>
                <div className="flex flex-wrap gap-2">
                  {product.available_colors.map((color) => (
                    <span key={color} className="rounded-full border border-charcoal-400/20 bg-charcoal-800/70 px-3 py-1.5 text-xs font-medium text-charcoal-200">
                      {color}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-charcoal-500">La couleur souhaitée est confirmée avec l’atelier avant fabrication.</p>
              </div>
            )}

            <div className="space-y-3 border-t border-charcoal-400/10 pt-5">
              {inStock && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-charcoal-400/15 bg-charcoal-900/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-offwhite">Quantité</p>
                    <p className="text-[11px] text-charcoal-500">Maximum {maxQuantity} par commande</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      disabled={quantity <= 1}
                      aria-label="Diminuer la quantité"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-charcoal-400/20 text-charcoal-200 transition hover:border-brand-red disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-6 text-center text-sm font-bold tabular-nums text-offwhite" aria-live="polite">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                      disabled={quantity >= maxQuantity}
                      aria-label="Augmenter la quantité"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-charcoal-400/20 text-charcoal-200 transition hover:border-brand-red disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <button type="button" onClick={handleAddToCart} disabled={!inStock} className="btn-primary min-h-12 w-full">
                <ShoppingCart className="h-4 w-4" />
                {inStock ? 'Ajouter au panier' : combinationAvailable ? 'Indisponible' : 'Combinaison indisponible'}
              </button>
              <WishlistButton
                withLabel
                className="w-full"
                product={{
                  id: product.id,
                  slug: product.slug,
                  name: product.name,
                  priceDzd: displayPrice,
                  imageUrl: activeImage,
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link to="/boutique/panier" className="inline-flex items-center gap-1.5 text-xs font-semibold text-charcoal-300 transition hover:text-white">
                  Voir le panier {inCart > 0 && <span className="rounded-full bg-brand-red/15 px-2 py-0.5 text-[10px] text-brand-red-light">{inCart}</span>}
                </Link>
                <Link to="/boutique/sur-mesure" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red-light transition hover:text-white">
                  Personnaliser ce projet
                </Link>
              </div>
              {added && (
                <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> Ajouté au panier.
                </p>
              )}
            </div>

            {specs.length > 0 && (
              <div className="rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 p-4">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-charcoal-400">Caractéristiques</h2>
                <dl className="grid gap-2.5 sm:grid-cols-2">
                  {specs.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-start gap-2.5">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" />
                      <div className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wider text-charcoal-500">{label}</dt>
                        <dd className="text-xs font-medium text-charcoal-100">{value}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>

      <RecentlyViewedProducts excludeId={product.id} />
    </div>
  )
}
