import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import type { Product } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import posthog, { isPostHogEnabled } from '@/lib/posthog'

type Props = {
  product: Product
  imageUrl?: string
}

export default function ProductCard({ product, imageUrl }: Props) {
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
      className="group card overflow-hidden transition-all hover:border-brand-red/30"
    >
      <div className="aspect-square overflow-hidden bg-charcoal-800">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-10 w-10 text-charcoal-600" />
          </div>
        )}
      </div>
      <div className="p-4">
        {product.category && (
          <span className="text-[10px] font-medium tracking-wide text-charcoal-400 uppercase">
            {product.category.name}
          </span>
        )}
        <h3 className="mt-1 truncate text-sm font-semibold text-offwhite group-hover:text-brand-red-light transition-colors">
          {product.name}
        </h3>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-bold text-offwhite">{formatDzd(product.price_dzd)}</span>
          {product.made_to_order ? (
            <span className="text-[10px] text-charcoal-400">Sur commande</span>
          ) : product.stock_quantity > 0 ? (
            <span className="text-[10px] text-green-500">En stock</span>
          ) : (
            <span className="text-[10px] text-brand-red-light">Épuisé</span>
          )}
        </div>
      </div>
    </Link>
  )
}
