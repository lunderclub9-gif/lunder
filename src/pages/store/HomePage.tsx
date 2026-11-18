import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BadgeCheck, Box, ChevronRight, Clock3, Layers3,
  Package, Printer, RefreshCw, ShieldCheck, Sparkles, Truck,
  AlertTriangle,
} from 'lucide-react'
import { supabase, type Product } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import { useVisualIdentity } from '@/lib/visual-identity'

export default function HomePage() {
  const config = useVisualIdentity()
  const [featured, setFeatured] = useState<Product[]>([])
  const [recent, setRecent] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    const featuredQuery = supabase
      .from('products')
      .select('*, category:categories(*), product_images(*)')
      .eq('status', 'published')
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(4)
    const recentQuery = supabase
      .from('products')
      .select('*, category:categories(*), product_images(*)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(8)
    const [featuredResult, recentResult] = await Promise.all([featuredQuery, recentQuery])

    if (featuredResult.error || recentResult.error) {
      console.error('[LUNDER] chargement du catalogue impossible')
      setFeatured([])
      setRecent([])
      setFailed(true)
      setLoading(false)
      return
    }

    setFeatured((featuredResult.data as Product[]) ?? [])
    setRecent((recentResult.data as Product[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const primaryImage = (product: Product) =>
    product.product_images?.find((image) => image.is_primary)?.image_url ??
    product.product_images?.[0]?.image_url

  return (
    <div className="overflow-hidden">
      <section className="relative isolate border-b border-charcoal-400/10 bg-charcoal-950">
        <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-32 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand-red/15 blur-3xl" />
          <div className="absolute -bottom-48 left-1/4 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.055)_1px,transparent_0)] [background-size:28px_28px] opacity-40" />
        </div>
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-28">
          <div className="max-w-2xl animate-slide-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-red/30 bg-brand-red/10 px-3.5 py-2">
              <Sparkles className="h-4 w-4 text-brand-red-light" />
              <span className="text-xs font-semibold tracking-wide text-brand-red-light">STUDIO D'IMPRESSION 3D · ALGÉRIE</span>
            </div>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-offwhite sm:text-5xl lg:text-6xl">
              {config.content.heroTitle}
              <span className="block bg-gradient-to-r from-brand-red-light to-orange-300 bg-clip-text text-transparent">{config.content.heroHighlight}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-charcoal-300 sm:text-lg">
              {config.content.heroDescription}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/boutique/produits" className="btn-primary min-h-12 px-6">
                {config.content.primaryButton} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/boutique/sur-mesure" className="btn-secondary min-h-12 border-charcoal-300/30 px-6">
                {config.content.secondaryButton} <Box className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-charcoal-400">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-400" /> Paiement à la livraison</span>
              <span className="inline-flex items-center gap-2"><Truck className="h-4 w-4 text-brand-red-light" /> Livraison en Algérie</span>
              <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-brand-red-light" /> Fabrication sur mesure</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute inset-8 rounded-[2rem] bg-brand-red/20 blur-3xl" />
            <div data-vi-float className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-charcoal-700/80 via-charcoal-800 to-charcoal-950 p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.24em] text-brand-red-light">DESIGN · PRINT · CREATE</p>
                  <p className="mt-1 text-sm font-semibold text-offwhite">De l'imagination à la réalité</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-red shadow-lg shadow-brand-red/30">
                  <Printer className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="relative my-8 flex aspect-[5/4] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.18),transparent_62%),linear-gradient(145deg,#292929,#111214)]">
                {config.assets.heroImage && <img src={config.assets.heroImage} alt="Présentation LUNDER" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-35" />}
                <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="relative flex h-44 w-44 items-center justify-center rounded-[2.5rem] border border-brand-red/40 bg-gradient-to-br from-brand-red/30 to-charcoal-900/80 shadow-[0_25px_80px_rgba(220,38,38,0.2)] sm:h-52 sm:w-52">
                  <Box className="h-24 w-24 text-brand-red-light drop-shadow-[0_0_24px_rgba(248,113,113,0.45)]" strokeWidth={1.1} />
                  <span className="absolute -right-5 top-5 rounded-full border border-white/10 bg-charcoal-900/90 px-3 py-1.5 text-[10px] font-semibold text-offwhite shadow-lg">3D DESIGN</span>
                  <span className="absolute -bottom-3 -left-5 rounded-full border border-white/10 bg-charcoal-900/90 px-3 py-1.5 text-[10px] font-semibold text-offwhite shadow-lg">MADE FOR YOU</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[['01', 'Imaginez'], ['02', 'Personnalisez'], ['03', 'Recevez']].map(([number, label]) => (
                  <div key={number} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <span className="text-[10px] font-bold text-brand-red-light">{number}</span>
                    <p className="mt-1 text-xs font-semibold text-offwhite">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-charcoal-400/10 bg-charcoal-900/80">
        <div className="mx-auto grid max-w-7xl gap-px bg-charcoal-400/10 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            { value: '01', title: 'Choisissez ou imaginez', text: 'Une création du catalogue ou une idée à fabriquer.' },
            { value: '02', title: 'Validez les détails', text: 'Matière, dimensions, livraison : tout est expliqué.' },
            { value: '03', title: 'Recevez en Algérie', text: 'Un suivi clair, du premier clic à la livraison.' },
          ].map((item) => (
            <div key={item.value} className="flex gap-4 bg-charcoal-900 py-6 sm:px-5 lg:py-7">
              <span className="font-mono text-xs font-bold text-brand-red-light">{item.value}</span>
              <div><h2 className="text-sm font-bold text-offwhite">{item.title}</h2><p className="mt-1 text-xs leading-5 text-charcoal-400">{item.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      {config.sections.benefits && (
      <section className="mx-auto grid max-w-7xl gap-3 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:px-8">
        {[
          { icon: BadgeCheck, title: 'Créations soignées', text: 'Des produits sélectionnés et fabriqués avec attention.' },
          { icon: Clock3, title: 'Un projet accompagné', text: 'Un parcours clair, de la demande au suivi de commande.' },
          { icon: Truck, title: 'Livraison en Algérie', text: 'Choisissez les options proposées lors de votre commande.' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-4 rounded-2xl border border-charcoal-400/15 bg-charcoal-800/40 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><Icon className="h-5 w-5" /></div>
            <div><h2 className="text-sm font-bold text-offwhite">{title}</h2><p className="mt-1 text-xs leading-6 text-charcoal-400">{text}</p></div>
          </div>
        ))}
      </section>
      )}

      {config.sections.featured && featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div><p className="mb-2 text-xs font-bold tracking-[0.18em] text-brand-red-light">SÉLECTION LUNDER</p><h2 className="text-2xl font-bold text-offwhite sm:text-3xl">{config.content.featuredTitle}</h2><p className="mt-2 text-sm text-charcoal-400">Des créations mises en avant dans notre boutique.</p></div>
            <Link to="/boutique/produits" className="hidden items-center gap-1 text-sm font-semibold text-brand-red-light hover:text-white sm:inline-flex">Tout voir <ChevronRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => <ProductCard key={product.id} product={product} imageUrl={primaryImage(product)} />)}
          </div>
        </section>
      )}

      {config.sections.custom && (
      <section className="border-y border-charcoal-400/10 bg-charcoal-950/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.18em] text-brand-red-light">VOTRE PROJET, VOTRE FORMAT</p>
            <h2 className="text-2xl font-bold text-offwhite sm:text-3xl">{config.content.customTitle}</h2>
            <p className="mt-3 text-sm leading-7 text-charcoal-400">Envoyez votre modèle 3D, une image ou simplement votre idée. Décrivez le résultat souhaité et transmettez votre demande à notre atelier.</p>
            <Link to="/boutique/sur-mesure" className="btn-primary mt-6">Demander une fabrication <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Box, title: 'Un fichier 3D', text: 'GLB, GLTF, STL ou OBJ selon votre projet.' },
              { icon: Sparkles, title: 'Une inspiration', text: 'Une photo ou une idée à transformer.' },
              { icon: Layers3, title: 'Plusieurs pièces', text: 'Décrivez chaque élément de votre demande.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/50 p-5">
                <Icon className="mb-4 h-6 w-6 text-brand-red-light" /><h3 className="text-sm font-bold text-offwhite">{title}</h3><p className="mt-2 text-xs leading-6 text-charcoal-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {config.sections.latest && (
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><p className="mb-2 text-xs font-bold tracking-[0.18em] text-brand-red-light">À DÉCOUVRIR</p><h2 className="text-2xl font-bold text-offwhite sm:text-3xl">{config.content.latestTitle}</h2><p className="mt-2 text-sm text-charcoal-400">Les derniers produits ajoutés à la boutique.</p></div>
          <Link to="/boutique/produits" className="hidden items-center gap-1 text-sm font-semibold text-brand-red-light hover:text-white sm:inline-flex">Voir le catalogue <ChevronRight className="h-4 w-4" /></Link>
        </div>
        {loading ? (
          <div className="card py-16 text-center" aria-busy="true"><Package className="mx-auto mb-4 h-12 w-12 animate-pulse text-charcoal-500" /><p className="text-charcoal-400">Chargement des produits…</p></div>
        ) : failed ? (
          <div className="card py-16 text-center" role="alert"><AlertTriangle className="mx-auto mb-4 h-12 w-12 text-brand-red" /><p className="text-charcoal-300">Impossible de charger les produits pour le moment.</p><p className="mt-1 text-xs text-charcoal-500">Vérifiez votre connexion, puis réessayez.</p><button type="button" onClick={() => void loadProducts()} className="btn-ghost mx-auto mt-4"><RefreshCw className="h-4 w-4" />Réessayer</button></div>
        ) : recent.length === 0 ? (
          <div className="card py-16 text-center"><Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" /><p className="text-charcoal-400">La boutique ouvre bientôt. Revenez vite !</p></div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{recent.map((product) => <ProductCard key={product.id} product={product} imageUrl={primaryImage(product)} />)}</div>
        )}
      </section>
      )}

      {config.sections.finalCta && (
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 rounded-3xl border border-brand-red/20 bg-gradient-to-r from-brand-red/15 via-charcoal-800 to-charcoal-800 p-7 text-center sm:flex-row sm:text-left sm:p-10">
          <div><p className="text-xs font-bold tracking-[0.18em] text-brand-red-light">PRÊT À COMMENCER ?</p><h2 className="mt-2 text-2xl font-bold text-offwhite">{config.content.ctaTitle}</h2><p className="mt-2 text-sm text-charcoal-300">{config.content.ctaDescription}</p></div>
          <Link to="/boutique/produits" className="btn-primary shrink-0">Découvrir LUNDER <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
      )}
    </div>
  )
}
