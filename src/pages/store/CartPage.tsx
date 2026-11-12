import { Link } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { formatDzd } from '@/lib/format'

export default function CartPage() {
  const { items, subtotal, setQuantity, remove } = useCart()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-3xl font-bold text-offwhite">Mon panier</h1>

      {items.length === 0 ? (
        <div className="card py-16 text-center">
          <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-300">Votre panier est vide.</p>
          <Link to="/boutique/produits" className="btn-primary mt-6">
            Découvrir la boutique
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            {items.map((line) => (
              <div key={line.key} className="card flex gap-4 p-4">
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-charcoal-800">
                  {line.imageUrl ? (
                    <img
                      src={line.imageUrl}
                      alt={line.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/boutique/produits/${line.slug}`}
                    className="text-sm font-semibold text-offwhite hover:text-brand-red"
                  >
                    {line.name}
                  </Link>
                  {line.variantLabel && (
                    <p className="text-xs text-charcoal-400">{line.variantLabel}</p>
                  )}
                  <p className="mt-1 text-sm text-charcoal-300">{formatDzd(line.unitPriceDzd)}</p>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-charcoal-400/20">
                      <button
                        type="button"
                        onClick={() => setQuantity(line.key, line.quantity - 1)}
                        className="p-2 text-charcoal-300 hover:text-offwhite"
                        aria-label={`Réduire la quantité de ${line.name}`}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-8 text-center text-sm text-offwhite">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(line.key, line.quantity + 1)}
                        className="p-2 text-charcoal-300 hover:text-offwhite"
                        aria-label={`Augmenter la quantité de ${line.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(line.key)}
                      className="inline-flex items-center gap-1 text-xs text-charcoal-400 hover:text-brand-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Retirer
                    </button>
                  </div>
                </div>

                <div className="text-right text-sm font-semibold text-offwhite">
                  {formatDzd(line.unitPriceDzd * line.quantity)}
                </div>
              </div>
            ))}
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between text-sm text-charcoal-300">
              <span>Sous-total</span>
              <span className="text-base font-semibold text-offwhite">{formatDzd(subtotal)}</span>
            </div>
            <p className="mt-2 text-xs text-charcoal-500">
              Les frais de livraison sont calculés à l'étape suivante, selon votre wilaya et votre
              commune. Le montant final est recalculé par la boutique.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Link to="/boutique/produits" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" />
              Continuer mes achats
            </Link>
            <Link to="/boutique/commande" className="btn-primary">
              Passer la commande
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
