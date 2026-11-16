import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2, Package, ShoppingBag } from 'lucide-react'
import type { Product } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import posthog, { isPostHogEnabled } from '@/lib/posthog'

type Props = {
  product: Product
  imageUrl?: string
}

export default function ProductCard({ product, imageUrl }: Props) {
  const available = product.made_to_order || product.stock_quantity > 0

  return (
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
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-charcoal-400/15 bg-charcoal-800/55 transition duration-300 hover:-translate-y-1 hover:border-brand-red/40 hover:bg-charcoal-800 hover:shadow-xl hover:shadow-black/20"
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-charcoal-700 to-charcoal-900">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-12 w-12 text-charcoal-600" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {product.category && (
            <span className="max-w-[10rem] truncate rounded-full border border-white/10 bg-charcoal-950/80 px-3 py-1 text-[10px] font-semibold text-charcoal-100 backdrop-blur">
              {product.category.name}
            </span>
          )}
        </div>
        <span className={`absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold backdrop-blur ${available ? 'bg-charcoal-950/85 text-green-300' : 'bg-charcoal-950/85 text-red-300'}`}>
          {available ? <CheckCircle2 className="h-3 w-3" /> : null}
          {product.made_to_order ? 'Fabriqué sur commande' : product.stock_quantity > 0 ? 'Disponible' : 'Indisponible'}
        </span>
        <span className="absolute right-3 top-3 flex h-9 w-9 translate-y-1 items-center justify-center rounded-full border border-white/10 bg-charcoal-950/80 text-white opacity-0 shadow-lg transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-offwhite transition-colors group-hover:text-brand-red-light">
          {product.name}
        </h3>
        {product.description ? (
          <p className="mt-2 line-clamp-2 min-h-9 text-xs leading-5 text-charcoal-400">{product.description}</p>
        ) : (
          <p className="mt-2 min-h-9 text-xs text-charcoal-500">Une création LUNDER'S 3D STUDIO.</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-charcoal-400/10 pt-4">
          <div className="min-w-0">
            <span className="block text-[10px] font-medium text-charcoal-400">Prix</span>
            <span className="mt-0.5 block text-lg font-extrabold tracking-tight text-offwhite">{formatDzd(product.price_dzd)}</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-red/10 px-3 py-2 text-xs font-semibold text-brand-red-light transition group-hover:bg-brand-red group-hover:text-white">
            <ShoppingBag className="h-3.5 w-3.5" /> Voir
          </span>
        </div>
      </div>
    </Link>
  )
}
