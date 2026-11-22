import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Box,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Layers3,
  Lightbulb,
  Package,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
  AlertTriangle,
} from 'lucide-react'
import { supabase, type Category, type Product } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import { setPageSeo } from '@/lib/seo'

const steps = [
  {
    number: '01',
    icon: Lightbulb,
    title: 'Partagez votre idée',
    description: 'Choisissez un produit du catalogue ou décrivez votre projet personnalisé, même avec une simple photo.',
  },
  {
    number: '02',
    icon: Wrench,
    title: 'Nous préparons votre projet',
    description: 'Le studio vérifie les détails, la faisabilité, la matière et le prix avant de lancer la fabrication.',
  },
  {
    number: '03',
    icon: Package,
    title: 'Recevez votre création',
    description: 'Suivez votre commande et choisissez la livraison disponible pour votre destination.',
  },
]

const benefits = [
  { icon: Layers3, title: 'Des créations variées', description: 'Des pièces pratiques, décoratives et des petites séries.' },
  { icon: Wrench, title: 'Du sur-mesure', description: 'Une demande adaptée à votre besoin, même si vous ne connaissez pas les détails techniques.' },
  { icon: ShieldCheck, title: 'Un prix expliqué', description: 'Les options et les frais sont présentés avant la validation de votre commande.' },
  { icon: Truck, title: 'Livraison organisée', description: 'Les modes et tarifs disponibles sont proposés selon votre wilaya et votre commune.' },
]

const questions = [
  {
    question: 'Dois-je créer un compte pour commander ?',
    answer: 'Non. Vous pouvez commander en tant que client invité. Gardez simplement votre numéro de commande et le téléphone utilisé pour la retrouver.',
  },
  {
    question: 'Puis-je demander une pièce sans connaître ses dimensions ?',
    answer: 'Oui. Décrivez votre idée et ajoutez une photo ou un fichier si vous en avez un. Le studio étudiera votre demande et préparera un devis manuel.',
  },
  {
    question: 'Le prix affiché est-il définitif pour une demande sur mesure ?',
    answer: 'Une estimation automatique est indicative. Le studio vérifie la faisabilité et vous transmet un devis avant toute fabrication.',
  },
  {
    question: 'Comment suivre ma commande ?',
    answer: 'Ouvrez la page « Suivre ma commande » et saisissez la référence de commande ainsi que le numéro de téléphone utilisé lors de l’achat.',
  },
  {
    question: 'Quels sont les moyens de paiement ?',
    answer: 'Le paiement à la livraison est proposé. Les modes et frais de livraison sont affichés pendant la commande selon la destination.',
  },
]

export default function HomePage() {
  const [featured, setFeatured] = useState<Product[]>([])
  const [recent, setRecent] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
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

    const categoryQuery = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .limit(6)

    const [featuredResult, recentResult, categoryResult] = await Promise.all([
      featuredQuery,
      recentQuery,
      categoryQuery,
    ])

    if (recentResult.error) {
      console.error('[LUNDER] chargement du catalogue impossible')
      setFeatured([])
      setRecent([])
      setCategories([])
      setFailed(true)
      setLoading(false)
      return
    }

    setFeatured(featuredResult.error ? [] : (featuredResult.data as Product[]) ?? [])
    setRecent((recentResult.data as Product[]) ?? [])
    setCategories(categoryResult.error ? [] : (categoryResult.data as Category[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadProducts()
    setPageSeo({
      title: 'LUNDER’S 3D STUDIO | Impression 3D et créations sur mesure',
      description: 'Découvrez les créations LUNDER, commandez en ligne ou partagez votre idée pour une fabrication 3D sur mesure en Algérie.',
      canonicalUrl: `${window.location.origin}/boutique`,
    })
  }, [loadProducts])

  const primaryImage = (product: Product) =>
    product.product_images?.find((image) => image.is_primary)?.image_url ??
    product.product_images?.[0]?.image_url

  const heroProduct = featured[0] ?? recent[0]
  const heroImage = heroProduct ? primaryImage(heroProduct) : undefined

  return (
    <div className="overflow-hidden">
      <section className="relative isolate border-b border-charcoal-400/10 bg-charcoal-950">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,rgba(220,38,38,0.18),transparent_42%),radial-gradient(ellipse_at_10%_90%,rgba(120,53,15,0.12),transparent_40%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
          <div className="animate-slide-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-red/30 bg-brand-red/10 px-3 py-1.5 text-xs font-semibold text-brand-red-light">
              <Sparkles className="h-3.5 w-3.5" />
              STUDIO D’IMPRESSION 3D · ALGÉRIE
            </div>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight text-offwhite sm:text-5xl lg:text-6xl">
              Votre idée prend forme.
              <span className="mt-2 block text-brand-red-light">Nous lui donnons vie en 3D.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-charcoal-300 sm:text-lg">
              Découvrez notre catalogue ou confiez-nous une création personnalisée.
              De la première idée à la pièce fabriquée, chaque projet commence par votre besoin.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/boutique/produits" className="btn-primary">
                Explorer la boutique <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/boutique/sur-mesure" className="btn-secondary">
                Parler de mon projet <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-charcoal-400">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> Commande sans compte</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> Paiement à la livraison</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> Projets personnalisés</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-5 rounded-[2rem] bg-brand-red/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-3xl border border-charcoal-400/20 bg-charcoal-800 shadow-2xl">
              {heroImage ? (
                <img src={heroImage} alt={heroProduct?.name ?? 'Création imprimée en 3D'} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.2),transparent_55%),linear-gradient(135deg,#262626,#111111)]">
                  <div className="flex h-36 w-36 items-center justify-center rounded-[2rem] border border-brand-red/30 bg-charcoal-900/70 shadow-2xl">
                    <Printer className="h-20 w-20 text-brand-red-light" strokeWidth={1.1} />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-charcoal-400/15 p-4 sm:p-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-red-light">DESIGN · PRINT · CREATE</p>
                  <p className="mt-1 text-sm font-semibold text-offwhite">De l’imagination à l’objet</p>
                </div>
                <span className="rounded-full border border-charcoal-400/20 bg-charcoal-900 px-3 py-1.5 text-xs text-charcoal-300">LUNDER’S 3D STUDIO</span>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-2 hidden rounded-xl border border-charcoal-400/20 bg-charcoal-900 px-4 py-3 shadow-xl sm:block">
              <p className="flex items-center gap-2 text-xs font-semibold text-offwhite"><BadgeCheck className="h-4 w-4 text-green-400" /> Un projet, une solution</p>
              <p className="mt-1 text-[11px] text-charcoal-400">Catalogue et fabrication personnalisée</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-charcoal-400/10 bg-charcoal-900">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:px-6 md:grid-cols-4 lg:px-8">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-charcoal-800 text-brand-red-light">
                <benefit.icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xs font-semibold text-offwhite sm:text-sm">{benefit.title}</h2>
                <p className="mt-1 text-[11px] leading-5 text-charcoal-400 sm:text-xs">{benefit.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="admin-eyebrow">TROUVEZ VOTRE INSPIRATION</p>
              <h2 className="text-2xl font-bold text-offwhite sm:text-3xl">Explorer par catégorie</h2>
            </div>
            <Link to="/boutique/produits" className="hidden items-center gap-1 text-sm font-semibold text-brand-red-light hover:text-offwhite sm:inline-flex">
              Tout le catalogue <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <Link
                key={category.id}
                to={`/boutique/categories/${category.slug}`}
                className="group flex min-h-28 items-center justify-between gap-4 rounded-2xl border border-charcoal-400/15 bg-charcoal-800/60 p-5 transition hover:-translate-y-0.5 hover:border-brand-red/40 hover:bg-charcoal-800"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-charcoal-700 text-brand-red-light transition group-hover:bg-brand-red/10">
                    {index % 3 === 0 ? <Box className="h-6 w-6" /> : index % 3 === 1 ? <Layers3 className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-offwhite">{category.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-charcoal-400">{category.description || 'Voir les créations de cette catégorie'}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-charcoal-500 transition group-hover:translate-x-1 group-hover:text-brand-red-light" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="border-y border-charcoal-400/10 bg-charcoal-950/70">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="admin-eyebrow">SÉLECTION DU STUDIO</p>
              <h2 className="text-2xl font-bold text-offwhite sm:text-3xl">Produits à découvrir</h2>
              <p className="mt-2 text-sm text-charcoal-400">Des créations disponibles dans notre catalogue.</p>
            </div>
            <Link to="/boutique/produits" className="hidden items-center gap-1 text-sm font-semibold text-brand-red-light hover:text-offwhite sm:inline-flex">
              Voir tout <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-charcoal-800" />)}
            </div>
          ) : failed ? (
            <div className="card py-12 text-center" role="alert">
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-brand-red" />
              <p className="text-sm text-charcoal-300">Impossible de charger le catalogue pour le moment.</p>
              <button type="button" onClick={() => void loadProducts()} className="btn-ghost mx-auto mt-4">
                <RefreshCw className="h-4 w-4" /> Réessayer
              </button>
            </div>
          ) : (featured.length > 0 || recent.length > 0) ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              {(featured.length > 0 ? featured : recent.slice(0, 4)).map((product) => (
                <ProductCard key={product.id} product={product} imageUrl={primaryImage(product)} />
              ))}
            </div>
          ) : (
            <div className="card py-12 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-charcoal-500" />
              <p className="text-sm text-charcoal-300">Le catalogue se prépare. Revenez bientôt découvrir nos créations.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="admin-eyebrow">SIMPLE ET TRANSPARENT</p>
          <h2 className="text-2xl font-bold text-offwhite sm:text-3xl">Comment ça marche ?</h2>
          <p className="mt-2 text-sm leading-6 text-charcoal-400">Vous gardez le contrôle à chaque étape : nous clarifions le besoin avant de fabriquer.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.number} className="relative rounded-2xl border border-charcoal-400/15 bg-charcoal-800/50 p-6">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><step.icon className="h-5 w-5" /></div>
                <span className="font-mono text-sm font-bold text-charcoal-500">{step.number}</span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-offwhite">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-charcoal-400">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-brand-red/25 bg-[radial-gradient(ellipse_at_90%_0%,rgba(220,38,38,0.2),transparent_45%),linear-gradient(135deg,#202020,#111111)] p-6 sm:p-10 lg:p-12">
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.18em] text-brand-red-light">VOUS AVEZ UNE IDÉE ?</p>
              <h2 className="mt-3 text-2xl font-bold text-offwhite sm:text-3xl">Même une simple photo peut être le début de votre projet.</h2>
              <p className="mt-3 text-sm leading-6 text-charcoal-300">Pas besoin de connaître les dimensions, le poids ou la matière. Expliquez ce que vous voulez, ajoutez une référence si vous en avez une, et le studio étudiera votre demande.</p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs text-charcoal-300">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> Sans compte client</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> Photos et fichiers facultatifs</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" /> Devis étudié par le studio</span>
              </div>
            </div>
            <Link to="/boutique/sur-mesure" className="btn-primary whitespace-nowrap">
              Décrire mon projet <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-charcoal-400/10 bg-charcoal-950 py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="admin-eyebrow">BESOIN D’INFORMATIONS ?</p>
            <h2 className="text-2xl font-bold text-offwhite sm:text-3xl">Questions fréquentes</h2>
            <p className="mt-2 text-sm text-charcoal-400">Les réponses utiles avant de passer commande.</p>
          </div>
          <div className="mt-8 space-y-3">
            {questions.map((item) => (
              <details key={item.question} className="group rounded-xl border border-charcoal-400/15 bg-charcoal-900 px-4 py-4 open:border-brand-red/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-offwhite">
                  {item.question}
                  <span className="text-brand-red-light transition group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-charcoal-400">{item.answer}</p>
              </details>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/boutique/informations" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-red-light hover:text-offwhite">
              Toutes les informations et politiques <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-red/10 text-brand-red-light"><Clock3 className="h-6 w-6" /></div>
          <h2 className="text-xl font-bold text-offwhite">Prêt à commencer ?</h2>
          <p className="max-w-xl text-sm text-charcoal-400">Parcourez les produits ou envoyez-nous votre idée. Votre commande reste accessible sans créer de compte.</p>
          <Link to="/boutique/produits" className="btn-primary mt-2">Découvrir les créations <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  )
}
