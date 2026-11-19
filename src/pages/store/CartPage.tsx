import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { formatDzd } from '@/lib/format'

export default function CartPage() {
  const { items, subtotal, setQuantity, remove, clear } = useCart()
  const articleCount = items.reduce((total, line) => total + line.quantity, 0)

  const handleClear = () => {
    if (window.confirm('Retirer tous les articles du panier ?')) clear()
  }

  return (
    <div className="min-h-screen">
      <section className="lz-hero">
        <div className="lz-container py-9 sm:py-11">
          <p className="lz-eyebrow mb-3">Votre sélection</p>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="lz-display text-[clamp(2rem,4vw,3rem)]">Mon panier</h1>
              <p className="lz-lead mt-3 max-w-xl">
                Vérifiez vos articles, puis choisissez votre mode de livraison à l’étape suivante.
              </p>
            </div>
            {items.length > 0 && (
              <p className="text-xs text-charcoal-400" aria-live="polite">
                {articleCount} article{articleCount > 1 ? 's' : ''} · {formatDzd(subtotal)}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="lz-container py-8">
        {items.length === 0 ? (
          <div className="mx-auto max-w-xl">
            <div className="lz-card px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-charcoal-400/20 bg-charcoal-900/60">
                <ShoppingBag className="h-7 w-7 text-charcoal-300" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-offwhite">Votre panier attend sa première création.</h2>
              <p className="mt-2 text-sm leading-6 text-charcoal-400">
                Parcourez la boutique, ou lancez directement une fabrication sur mesure.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Link to="/boutique/produits" className="btn-primary">
                  Découvrir la boutique <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/boutique/sur-mesure" className="btn-secondary">Créer sur mesure</Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-bold text-offwhite">
                  {items.length} ligne{items.length > 1 ? 's' : ''} dans votre panier
                </h2>
                <div className="flex items-center gap-4">
                  <Link to="/boutique/produits" className="text-xs font-semibold text-brand-red-light hover:text-white">
                    Continuer les achats
                  </Link>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 text-xs font-medium text-charcoal-400 transition hover:text-brand-red-light"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Vider
                  </button>
                </div>
              </div>

              {items.map((line) => (
                <article key={line.key} className="lz-card flex gap-3 p-3 sm:gap-5 sm:p-4">
                  <Link
                    to={`/boutique/produits/${line.slug}`}
                    className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-charcoal-900 sm:h-28 sm:w-28"
                  >
                    {line.imageUrl ? (
                      <img src={line.imageUrl} alt={line.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><ShoppingBag className="h-7 w-7 text-charcoal-600" /></div>
                    )}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/boutique/produits/${line.slug}`} className="line-clamp-2 text-sm font-bold text-offwhite transition hover:text-brand-red-light sm:text-base">
                          {line.name}
                        </Link>
                        {line.variantLabel && <p className="mt-1 text-xs text-charcoal-400">{line.variantLabel}</p>}
                        <p className="mt-1 text-xs text-charcoal-400">
                          {formatDzd(line.unitPriceDzd)} <span className="text-charcoal-500">/ unité</span>
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-extrabold tabular-nums text-offwhite sm:text-base">
                        {formatDzd(line.unitPriceDzd * line.quantity)}
                      </p>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                      <div className="inline-flex items-center rounded-xl border border-charcoal-400/20 bg-charcoal-900/70">
                        <button
                          type="button"
                          onClick={() => setQuantity(line.key, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          className="flex h-9 w-9 items-center justify-center rounded-l-xl text-charcoal-300 transition hover:bg-charcoal-700 hover:text-white disabled:opacity-30"
                          aria-label={`Réduire la quantité de ${line.name}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-9 text-center text-sm font-semibold tabular-nums text-offwhite" aria-live="polite">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(line.key, line.quantity + 1)}
                          disabled={line.quantity >= 10}
                          className="flex h-9 w-9 items-center justify-center rounded-r-xl text-charcoal-300 transition hover:bg-charcoal-700 hover:text-white disabled:opacity-30"
                          aria-label={`Augmenter la quantité de ${line.name}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line.key)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-charcoal-400 transition hover:bg-brand-red/10 hover:text-brand-red-light"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Retirer
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              <Link to="/boutique/produits" className="inline-flex items-center gap-2 px-1 py-2 text-sm font-semibold text-charcoal-300 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Retour à la boutique
              </Link>
            </div>

            <aside className="lz-panel p-5 lg:sticky lg:top-24">
              <h2 className="text-lg font-bold text-offwhite">Récapitulatif</h2>
              <div className="mt-4 space-y-3 border-b border-charcoal-400/10 pb-4 text-sm">
                <div className="flex justify-between gap-3 text-charcoal-300">
                  <span>Articles ({articleCount})</span>
                  <span className="font-semibold text-offwhite">{formatDzd(subtotal)}</span>
                </div>
                <div className="flex justify-between gap-3 text-charcoal-300">
                  <span>Livraison</span>
                  <span className="text-charcoal-400">Calculée à l’étape suivante</span>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3 py-4">
                <span className="text-sm font-semibold text-charcoal-200">Sous-total</span>
                <span className="text-2xl font-black tracking-tight text-offwhite">{formatDzd(subtotal)}</span>
              </div>
              <Link to="/boutique/commande" className="btn-primary min-h-12 w-full">
                Continuer vers la livraison <ArrowRight className="h-4 w-4" />
              </Link>

              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-2.5 text-xs leading-5 text-charcoal-400">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>Vos informations sont vérifiées avant l’enregistrement de la commande.</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs leading-5 text-charcoal-400">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" />
                  <span>Les frais dépendent de votre wilaya, de votre commune et du mode de livraison.</span>
                </div>
              </div>

              <p className="mt-4 border-t border-charcoal-400/10 pt-4 text-[11px] leading-5 text-charcoal-500">
                Paiement à la livraison. Le prix définitif, les frais et la disponibilité sont
                recalculés par la boutique lors de l’enregistrement.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
