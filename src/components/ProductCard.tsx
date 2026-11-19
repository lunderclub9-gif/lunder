import { Link } from 'react-router-dom'
import { ArrowUpRight, Box, CheckCircle2, Clock3, PackageX } from 'lucide-react'
import type { Product } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import posthog, { isPostHogEnabled } from '@/lib/posthog'
import WishlistButton from '@/components/store/WishlistButton'

type Props = {
  product: Product
  imageUrl?: string
}

export default function ProductCard({ product, imageUrl }: Props) {
  const inStock = product.stock_quantity > 0
  const available = product.made_to_order || inStock

  const availability = product.made_to_order
    ? { label: 'Sur commande', tone: 'text-amber-300', icon: Clock3 }
    : inStock
      ? { label: 'En stock', tone: 'text-emerald-300', icon: CheckCircle2 }
      : { label: 'Épuisé', tone: 'text-red-300', icon: PackageX }
  const AvailabilityIcon = availability.icon

  const meta = [
    product.material,
    product.production_lead_days != null ? `${product.production_lead_days} j de fabrication` : null,
  ].filter(Boolean).join(' · ')

  return (
    <article className="lz-card group relative flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[4/5] overflow-hidden bg-charcoal-900">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_38%,rgba(227,38,54,.16),transparent_62%)]">
            <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.09)_1px,transparent_1px)] [background-size:24px_24px]" />
            <Box className="relative h-14 w-14 text-charcoal-400" strokeWidth={1.1} />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-charcoal-950/85 via-charcoal-950/5 to-transparent opacity-90" />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {product.category ? (
            <span className="lz-badge max-w-[9rem] truncate">{product.category.name}</span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            <WishlistButton
              product={{ id: product.id, slug: product.slug, name: product.name, priceDzd: product.price_dzd, imageUrl }}
            />
            <span className="flex h-8 w-8 translate-y-1 items-center justify-center rounded-full border border-white/15 bg-charcoal-950/70 text-white opacity-0 shadow-lg backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${availability.tone}`}>
            <AvailabilityIcon className="h-3.5 w-3.5" />
            {availability.label}
          </span>
          {product.is_featured && <span className="lz-badge lz-badge-signal">Sélection</span>}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-[1.1rem]">
        <h3 className="line-clamp-2 text-[0.9375rem] font-semibold leading-[1.35]">
          <Link
            to={`/boutique/produits/${product.slug}`}
            onClick={() => {
              if (isPostHogEnabled) {
                posthog.capture('product_selected', {
                  product_id: product.id,
                  category_id: product.category_id,
                  made_to_order: product.made_to_order,
                })
              }
            }}
            aria-label={`Voir ${product.name}, ${formatDzd(product.price_dzd)}`}
            className="text-offwhite transition-colors duration-200 after:absolute after:inset-0 after:z-0 after:rounded-[inherit] group-hover:text-brand-red-light"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-1 text-[11px] text-charcoal-400">
          {meta || (product.description ? product.description : 'Création LUNDER’S 3D STUDIO')}
        </p>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-charcoal-400/10 pt-3.5">
          <span className="text-[1.05rem] font-extrabold tracking-tight text-offwhite">{formatDzd(product.price_dzd)}</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-charcoal-400 transition group-hover:text-brand-red-light">
            Découvrir
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
      {!available && <span className="sr-only">Produit indisponible</span>}
    </article>
  )
}
