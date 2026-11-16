import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { formatDzd } from '@/lib/format'

export default function CartPage() {
  const { items, subtotal, setQuantity, remove } = useCart()

  return (
    <div className="min-h-screen">
      <section className="border-b border-charcoal-400/10 bg-charcoal-950">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
          <p className="text-xs font-bold tracking-[0.2em] text-brand-red-light">VOTRE SÉLECTION</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-offwhite sm:text-4xl">Mon panier</h1>
          <p className="mt-2 text-sm text-charcoal-400">Vérifiez vos articles avant de passer votre commande.</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {items.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-charcoal-400/15 bg-charcoal-800/40 px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-charcoal-700"><ShoppingBag className="h-7 w-7 text-charcoal-300" /></div>
            <h2 className="mt-5 text-xl font-bold text-offwhite">Votre panier attend sa première création.</h2>
            <p className="mt-2 text-sm leading-6 text-charcoal-400">Parcourez la boutique et ajoutez les produits qui vous plaisent.</p>
            <Link to="/boutique/produits" className="btn-primary mt-6">Découvrir la boutique <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-offwhite">{items.length} ligne{items.length > 1 ? 's' : ''} dans votre panier</h2>
                <Link to="/boutique/produits" className="text-xs font-semibold text-brand-red-light hover:text-white">Continuer les achats</Link>
              </div>
              {items.map((line) => (
                <article key={line.key} className="flex gap-3 rounded-2xl border border-charcoal-400/15 bg-charcoal-800/45 p-3 sm:gap-5 sm:p-5">
                  <Link to={`/boutique/produits/${line.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-charcoal-900 sm:h-28 sm:w-28">
                    {line.imageUrl ? <img src={line.imageUrl} alt={line.name} loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" /> : <div className="flex h-full items-center justify-center"><ShoppingBag className="h-7 w-7 text-charcoal-600" /></div>}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/boutique/produits/${line.slug}`} className="line-clamp-2 text-sm font-bold text-offwhite hover:text-brand-red-light sm:text-base">{line.name}</Link>
                        {line.variantLabel && <p className="mt-1 text-xs text-charcoal-400">{line.variantLabel}</p>}
                        <p className="mt-1 text-xs text-charcoal-400">{formatDzd(line.unitPriceDzd)} <span className="text-charcoal-500">/ unité</span></p>
                      </div>
                      <p className="shrink-0 text-sm font-extrabold text-offwhite sm:text-base">{formatDzd(line.unitPriceDzd * line.quantity)}</p>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                      <div className="inline-flex items-center rounded-xl border border-charcoal-400/20 bg-charcoal-900/70">
                        <button type="button" onClick={() => setQuantity(line.key, line.quantity - 1)} disabled={line.quantity <= 1} className="flex h-9 w-9 items-center justify-center rounded-l-xl text-charcoal-300 transition hover:bg-charcoal-700 hover:text-white disabled:opacity-30" aria-label={`Réduire la quantité de ${line.name}`}><Minus className="h-3.5 w-3.5" /></button>
                        <span className="min-w-9 text-center text-sm font-semibold text-offwhite" aria-live="polite">{line.quantity}</span>
                        <button type="button" onClick={() => setQuantity(line.key, line.quantity + 1)} disabled={line.quantity >= 10} className="flex h-9 w-9 items-center justify-center rounded-r-xl text-charcoal-300 transition hover:bg-charcoal-700 hover:text-white disabled:opacity-30" aria-label={`Augmenter la quantité de ${line.name}`}><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                      <button type="button" onClick={() => remove(line.key)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-charcoal-400 transition hover:bg-brand-red/10 hover:text-brand-red-light"><Trash2 className="h-3.5 w-3.5" /> Retirer</button>
                    </div>
                  </div>
                </article>
              ))}
              <Link to="/boutique/produits" className="inline-flex items-center gap-2 px-1 py-2 text-sm font-semibold text-charcoal-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Retour à la boutique</Link>
            </div>

            <aside className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/60 p-5 lg:sticky lg:top-24">
              <h2 className="text-lg font-bold text-offwhite">Récapitulatif</h2>
              <div className="mt-5 space-y-3 border-b border-charcoal-400/15 pb-5 text-sm">
                <div className="flex justify-between gap-3 text-charcoal-300"><span>Articles ({items.reduce((total, line) => total + line.quantity, 0)})</span><span className="font-semibold text-offwhite">{formatDzd(subtotal)}</span></div>
                <div className="flex justify-between gap-3 text-charcoal-300"><span>Livraison</span><span>Calculée à l'étape suivante</span></div>
              </div>
              <div className="flex items-end justify-between gap-3 py-5"><span className="text-sm font-semibold text-charcoal-200">Sous-total</span><span className="text-2xl font-black tracking-tight text-offwhite">{formatDzd(subtotal)}</span></div>
              <Link to="/boutique/commande" className="btn-primary min-h-12 w-full">Continuer vers la livraison <ArrowRight className="h-4 w-4" /></Link>
              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-2.5 text-xs leading-5 text-charcoal-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /><span>Vos informations de commande sont vérifiées avant validation.</span></div>
                <div className="flex items-start gap-2.5 text-xs leading-5 text-charcoal-400"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" /><span>Les frais de livraison dépendent de votre wilaya, commune et mode de livraison.</span></div>
              </div>
              <p className="mt-4 border-t border-charcoal-400/15 pt-4 text-[11px] leading-5 text-charcoal-500">Paiement à la livraison. Le prix définitif et la disponibilité sont recalculés par le système lors de l'enregistrement de la commande.</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
