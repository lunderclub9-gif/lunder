import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, History } from 'lucide-react'
import { formatDzd } from '@/lib/format'
import { readRecentlyViewed } from '@/lib/recently-viewed'
import SectionHeading from '@/components/store/SectionHeading'

type Props = {
  excludeId?: string
  limit?: number
  className?: string
}

/**
 * Aperçu local des pièces consultées. Aucun appel réseau : la liste vient du
 * stockage du visiteur, filtrée et validée par `readRecentlyViewed`.
 */
export default function RecentlyViewedProducts({ excludeId, limit = 6, className = '' }: Props) {
  const items = useMemo(
    () => readRecentlyViewed().filter((item) => item.id !== excludeId).slice(0, limit),
    [excludeId, limit]
  )

  if (items.length === 0) return null

  return (
    <section className={`lz-container py-12 sm:py-14 ${className}`.trim()} aria-label="Vus récemment">
      <SectionHeading
        eyebrow="Reprendre l’exploration"
        title="Vus récemment"
        action={
          <Link
            to="/boutique/produits"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red-light transition hover:text-offwhite"
          >
            Tout le catalogue <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-thin sm:mx-0 sm:px-0">
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/boutique/produits/${item.slug}`}
            className="lz-card group w-[10.5rem] shrink-0 snap-start overflow-hidden sm:w-48"
          >
            <div className="relative aspect-square overflow-hidden bg-charcoal-900">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <History className="h-8 w-8 text-charcoal-500" />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-xs font-semibold leading-4 text-offwhite group-hover:text-brand-red-light">{item.name}</p>
              <p className="mt-1 text-xs font-bold text-charcoal-300">{formatDzd(item.priceDzd)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
