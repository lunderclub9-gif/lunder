import { Heart } from 'lucide-react'
import { useWishlist } from '@/lib/wishlist'

type Props = {
  product: {
    id: string
    slug: string
    name: string
    priceDzd: number
    imageUrl?: string | null
  }
  className?: string
  withLabel?: boolean
}

/** Bouton favori : conserve la pièce localement, sans compte ni requête. */
export default function WishlistButton({ product, className = '', withLabel = false }: Props) {
  const { has, toggle } = useWishlist()
  const active = has(product.id)

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Retirer ${product.name} des favoris` : `Ajouter ${product.name} aux favoris`}
      title={active ? 'Retirer des favoris' : 'Garder cette pièce'}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle({
          id: product.id,
          slug: product.slug,
          name: product.name,
          priceDzd: product.priceDzd,
          imageUrl: product.imageUrl ?? null,
        })
      }}
      className={
        withLabel
          ? `inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              active
                ? 'border-brand-red/45 bg-brand-red/10 text-brand-red-light'
                : 'border-charcoal-400/25 text-charcoal-300 hover:border-brand-red/45 hover:text-brand-red-light'
            } ${className}`
          : `relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition ${
              active
                ? 'border-brand-red/50 bg-brand-red/20 text-brand-red-light'
                : 'border-white/15 bg-charcoal-950/70 text-white hover:border-brand-red/50 hover:text-brand-red-light'
            } ${className}`
      }
    >
      <Heart className={`h-4 w-4 ${active ? 'fill-current' : ''}`} aria-hidden="true" />
      {withLabel && <span>{active ? 'Dans mes favoris' : 'Garder cette pièce'}</span>}
    </button>
  )
}
