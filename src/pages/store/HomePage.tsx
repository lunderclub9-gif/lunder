import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Box, Boxes, ChevronRight, Clock3,
  Layers3, Package, Printer, RefreshCw, ShieldCheck, Sparkles, Truck, Wand2,
  AlertTriangle, FileBox, Ruler, TruckIcon,
} from 'lucide-react'
import { supabase, type Category, type Product } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import SectionHeading from '@/components/store/SectionHeading'
import Reveal from '@/components/store/Reveal'
import RecentlyViewedProducts from '@/components/store/RecentlyViewedProducts'
import { useVisualIdentity } from '@/lib/visual-identity'

type CategoryCoverRow = {
  category_id: string | null
  product_images: { image_url: string; is_primary: boolean; sort_order: number }[] | null
}

const primaryImage = (product: Product) =>
  product.product_images?.find((image) => image.is_primary)?.image_url ??
  product.product_images?.[0]?.image_url

const materials = ['PLA', 'PETG', 'ABS', 'TPU', 'Résine', 'Nylon', 'Prototypage', 'Petites séries', 'Sur mesure']

const trustPoints = [
  {
    icon: BadgeCheck,
    title: 'Créations soignées',
    text: 'Chaque pièce est vérifiée avant expédition : matière, dimensions, finitions.',
  },
  {
    icon: Clock3,
    title: 'Un projet accompagné',
    text: 'Un parcours clair, du devis à la livraison, avec un interlocuteur unique.',
  },
  {
    icon: Truck,
    title: 'Livraison en Algérie',
    text: 'Domicile ou point relais, selon les options disponibles dans votre wilaya.',
  },
  {
    icon: ShieldCheck,
    title: 'Paiement à la livraison',
    text: 'Vous payez en espèces à la réception. Aucune carte bancaire nécessaire.',
  },
]

const steps = [
  {
    number: '01',
    icon: Wand2,
    title: 'Choisissez ou imaginez',
    text: 'Une pièce du catalogue, un modèle 3D ou simplement une idée décrite à l’atelier.',
  },
  {
    number: '02',
    icon: Ruler,
    title: 'Validez les détails',
    text: 'Matière, couleur, dimensions et délai : tout est présenté avant fabrication.',
  },
  {
    number: '03',
    icon: TruckIcon,
    title: 'Recevez et suivez',
    text: 'Un numéro de suivi, un statut à chaque étape et une livraison dans votre wilaya.',
  },
]

export default function HomePage() {
  const config = useVisualIdentity()
  const [featured, setFeatured] = useState<Product[]>([])
  const [recent, setRecent] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryCovers, setCategoryCovers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const loadCatalogue = useCallback(async () => {
    setLoading(true)
    setFailed(false)

    const [featuredResult, recentResult, categoriesResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), product_images(*)')
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('products')
        .select('*, category:categories(*), product_images(*)')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('name')
        .limit(6),
    ])

    if (featuredResult.error || recentResult.error) {
      console.error('[LUNDER] chargement du catalogue impossible')
      setFeatured([])
      setRecent([])
      setFailed(true)
      setLoading(false)
      return
    }

    const activeCategories = categoriesResult.error ? [] : ((categoriesResult.data as Category[]) ?? [])
    setFeatured((featuredResult.data as Product[]) ?? [])
    setRecent((recentResult.data as Product[]) ?? [])
    setCategories(activeCategories)
    setLoading(false)

    if (activeCategories.length === 0) return

    const { data: coverRows, error: coverError } = await supabase
      .from('products')
      .select('category_id, product_images(image_url, is_primary, sort_order)')
      .eq('status', 'published')
      .in('category_id', activeCategories.map((category) => category.id))
      .order('created_at', { ascending: false })
      .limit(48)

    if (coverError) return

    const covers: Record<string, string> = {}
    ;((coverRows as CategoryCoverRow[]) ?? []).forEach((row) => {
      if (!row.category_id || covers[row.category_id]) return
      const sorted = [...(row.product_images ?? [])].sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
      )
      const url = sorted[0]?.image_url
      if (url) covers[row.category_id] = url
    })
    setCategoryCovers(covers)
  }, [])

  useEffect(() => {
    void loadCatalogue()
  }, [loadCatalogue])

  const heroProduct = featured[0] ?? recent[0]
  const heroImage = config.assets.heroImage || (heroProduct ? primaryImage(heroProduct) : undefined)

  return (
    <div className="overflow-hidden">
      {/* ---------------------------------------------------------------- HERO */}
      <section className="lz-hero">
        <div className="lz-container grid items-center gap-12 py-14 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:py-20 xl:py-24">
          <div className="max-w-2xl">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-red/25 bg-brand-red/10 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red-light">
                <Sparkles className="h-3.5 w-3.5" />
                Atelier d’impression 3D · Algérie
              </span>
            </Reveal>

            <Reveal delay={70}>
              <h1 className="lz-display mt-6">
                {config.content.heroTitle}
                <span className="lz-grad-text block">{config.content.heroHighlight}</span>
              </h1>
            </Reveal>

            <Reveal delay={130}>
              <p className="lz-lead mt-6 max-w-xl sm:text-[1.0625rem]">{config.content.heroDescription}</p>
            </Reveal>

            <Reveal delay={190}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/boutique/produits" className="btn-primary min-h-12 px-6">
                  {config.content.primaryButton} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/boutique/sur-mesure" className="btn-secondary min-h-12 px-6">
                  {config.content.secondaryButton} <Box className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>

            <Reveal delay={250}>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-charcoal-400">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Paiement à la livraison</span>
                <span className="inline-flex items-center gap-2"><Truck className="h-4 w-4 text-brand-red-light" /> Livraison nationale</span>
                <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-brand-red-light" /> Fabrication sur mesure</span>
              </div>
            </Reveal>

            <Reveal delay={310}>
              <dl className="mt-9 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-xl border border-charcoal-400/15 bg-charcoal-400/15">
                {[
                  ['Prototypage', 'Idées testées'],
                  ['Petites séries', 'Pièces répétables'],
                  ['Pièces uniques', 'Sur mesure'],
                ].map(([title, detail]) => (
                  <div key={title} className="bg-charcoal-900 px-3 py-3.5">
                    <dt className="text-[11px] font-bold text-offwhite">{title}</dt>
                    <dd className="mt-0.5 text-[10px] text-charcoal-400">{detail}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <Reveal delay={160} className="relative mx-auto w-full max-w-[34rem]">
            <div aria-hidden="true" className="absolute -inset-8 rounded-[3rem] bg-brand-red/10 blur-3xl" />
            <div className="lz-stage relative" data-vi-float>
              <div className="lz-stage-grid" />
              {heroImage && (
                <img
                  src={heroImage}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover opacity-30"
                  loading="eager"
                  decoding="async"
                />
              )}
              <div className="relative p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-brand-red-light">Design · Print · Create</p>
                    <p className="mt-1.5 text-sm font-semibold text-offwhite">De l’imagination à la réalité</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg shadow-brand-red/30">
                    <Printer className="h-5 w-5" />
                  </span>
                </div>

                <div className="relative my-6 flex aspect-[5/4] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_45%,rgba(227,38,54,.22),transparent_64%)]">
                  {heroImage ? (
                    <img
                      src={heroImage}
                      alt={heroProduct ? `Aperçu de ${heroProduct.name}` : 'Création LUNDER'}
                      className="h-full w-full object-cover"
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    <>
                      <span aria-hidden="true" className="absolute h-48 w-48 rounded-full border border-white/15 sm:h-60 sm:w-60" />
                      <span aria-hidden="true" className="absolute h-36 w-36 rounded-full border border-brand-red/30 sm:h-44 sm:w-44" />
                      <Printer className="relative h-16 w-16 text-brand-red-light drop-shadow-[0_0_28px_rgba(240,83,98,0.35)]" strokeWidth={1.1} />
                    </>
                  )}
                  <div className="absolute inset-x-0 bottom-0">
                    <div className="lz-layers" aria-hidden="true" />
                  </div>
                  <span className="absolute left-3 top-3 lz-badge lz-badge-signal">Atelier</span>
                  {heroProduct?.made_to_order && (
                    <span className="absolute right-3 top-3 lz-badge">Sur commande</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Idée', 'Brief & conseil'],
                    ['Modèle', 'Fichier ou dessin'],
                    ['Pièce', 'Impression & finition'],
                  ].map(([title, detail]) => (
                    <div key={title} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                      <p className="text-[11px] font-bold text-offwhite">{title}</p>
                      <p className="mt-0.5 text-[10px] text-charcoal-400">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -left-4 bottom-24 hidden rounded-xl border border-charcoal-400/20 bg-charcoal-950/85 px-3.5 py-2.5 shadow-xl backdrop-blur sm:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-charcoal-400">Matières</p>
              <p className="mt-0.5 text-xs font-semibold text-offwhite">PLA · PETG · TPU</p>
            </div>
            <div className="pointer-events-none absolute -right-3 top-16 hidden rounded-xl border border-brand-red/25 bg-charcoal-950/85 px-3.5 py-2.5 shadow-xl backdrop-blur sm:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-brand-red-light">Sur mesure</p>
              <p className="mt-0.5 text-xs font-semibold text-offwhite">Fichier 3D accepté</p>
            </div>
          </Reveal>
        </div>

        <div className="border-t border-charcoal-400/10 py-4">
          <div className="lz-marquee">
            <div className="lz-marquee-track">
              {[...materials, ...materials].map((material, index) => (
                <span
                  key={`${material}-${index}`}
                  aria-hidden={index >= materials.length}
                  className="inline-flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-charcoal-500"
                >
                  {material}
                  <span className="h-1 w-1 rounded-full bg-brand-red/60" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ BENEFITS */}
      {/* ---------------------------------------------------------- INTENTIONS */}
      <section className="lz-container pt-12 sm:pt-16" aria-label="Commencez par l’usage">
        <Reveal>
          <SectionHeading
            eyebrow="Commencez par l’usage"
            title="Une idée de pièce, pas seulement un catalogue."
            description="Choisissez votre point de départ : LUNDER vous emmène ensuite vers la bonne expérience — trouver, offrir, prototyper ou créer."
          />
        </Reveal>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Sparkles, eyebrow: 'Décorer', title: 'Donner du caractère à un espace', text: 'Objets, détails et petites séries pour votre intérieur.', to: '/boutique/decouvrir/decorer' },
            { icon: Package, eyebrow: 'Offrir', title: 'Trouver une pièce qui reste', text: 'Une création originale, prête à rejoindre quelqu’un.', to: '/boutique/decouvrir/offrir' },
            { icon: Printer, eyebrow: 'Prototyper', title: 'Passer de l’idée à la forme', text: 'Un fichier, une cote ou un premier modèle à tester.', to: '/boutique/decouvrir/prototyper' },
            { icon: Layers3, eyebrow: 'Personnaliser', title: 'Fabriquer votre propre version', text: 'Matière, taille, couleur et détails selon votre projet.', to: '/boutique/decouvrir/personnaliser' },
          ].map(({ icon: Icon, eyebrow, title, text, to }, index) => (
            <Reveal key={eyebrow} delay={index * 60}>
              <Link to={to} className="lz-card group flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-charcoal-500 transition group-hover:translate-x-1 group-hover:text-brand-red-light" />
                </div>
                <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-charcoal-500">{eyebrow}</p>
                <h3 className="mt-2 text-sm font-bold leading-5 text-offwhite">{title}</h3>
                <p className="mt-2 text-[12px] leading-6 text-charcoal-400">{text}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {config.sections.benefits && (
        <section className="lz-container py-12 sm:py-16" aria-label="Pourquoi choisir LUNDER">
          <Reveal>
            <SectionHeading
              eyebrow="Pourquoi LUNDER"
              title="La précision d’un atelier, la simplicité d’une boutique."
              description="Un studio de fabrication 3D qui explique chaque étape et assume chaque détail."
            />
          </Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trustPoints.map(({ icon: Icon, title, text }, index) => (
              <Reveal key={title} delay={index * 60}>
                <div className="lz-card h-full p-5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-offwhite">{title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-6 text-charcoal-400">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ FEATURED */}
      {config.sections.featured && (
        <section className="lz-container pb-12 sm:pb-16">
          <Reveal>
            <SectionHeading
              eyebrow="Sélection LUNDER"
              title={config.content.featuredTitle}
              description="Les pièces que nous aimons montrer en premier : utiles, précises, bien finies."
              action={
                <Link
                  to="/boutique/produits"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red-light transition hover:text-offwhite"
                >
                  Tout voir <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
          </Reveal>
          <div className="mt-7">
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-charcoal-400/10 bg-charcoal-800/60" />
                ))}
              </div>
            ) : featured.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {featured.map((product, index) => (
                  <Reveal key={product.id} delay={index * 60}>
                    <ProductCard product={product} imageUrl={primaryImage(product)} />
                  </Reveal>
                ))}
              </div>
            ) : (
              <div className="lz-card px-5 py-12 text-center">
                <Boxes className="mx-auto mb-3 h-10 w-10 text-charcoal-500" />
                <p className="text-sm text-charcoal-300">
                  La sélection arrive bientôt. Le catalogue complet reste accessible.
                </p>
                <Link to="/boutique/produits" className="btn-secondary mt-5">Parcourir le catalogue</Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- CATEGORIES */}
      {config.sections.categories && categories.length > 0 && (
        <section className="border-y border-charcoal-400/10 py-12 sm:py-16">
          <div className="lz-container">
            <Reveal>
              <SectionHeading
                eyebrow="Univers"
                title={config.content.categoriesTitle}
                description="Trouvez rapidement le type de pièce qui correspond à votre besoin."
              />
            </Reveal>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category, index) => (
                <Reveal key={category.id} delay={index * 60}>
                  <Link
                    to={`/boutique/produits?c=${encodeURIComponent(category.slug)}`}
                    className="group relative flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-2xl border border-charcoal-400/15 bg-charcoal-800/60 p-5 transition duration-300 hover:border-brand-red/40"
                  >
                    {categoryCovers[category.id] ? (
                      <img
                        src={categoryCovers[category.id]}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-700 group-hover:scale-105 group-hover:opacity-70"
                      />
                    ) : (
                      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(227,38,54,.22),transparent_60%)]">
                        <div className="lz-stage-grid" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950 via-charcoal-950/55 to-transparent" />
                    <div className="relative">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-bold text-offwhite">{category.name}</h3>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-charcoal-950/60 text-white transition group-hover:bg-brand-red">
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 max-w-md text-xs leading-5 text-charcoal-300">
                        {category.description || 'Découvrir les créations de cet univers.'}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- PROCESS */}
      {config.sections.process && (
        <section className="lz-container py-12 sm:py-16">
          <Reveal>
            <SectionHeading
              eyebrow="Le parcours"
              title={config.content.processTitle}
              description="Chaque étape est visible : vous savez toujours où en est votre pièce."
            />
          </Reveal>
          <div className="mt-8 grid gap-3 lg:grid-cols-3">
            {steps.map(({ number, icon: Icon, title, text }, index) => (
              <Reveal key={number} delay={index * 80}>
                <div className="lz-card relative h-full overflow-hidden p-6">
                  <span className="absolute right-5 top-4 font-mono text-3xl font-black text-charcoal-400/25">{number}</span>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-red/20 bg-brand-red/10 text-brand-red-light">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-base font-bold text-offwhite">{title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-charcoal-400">{text}</p>
                  {index < steps.length - 1 && (
                    <span aria-hidden="true" className="absolute bottom-5 right-5 text-charcoal-500 lg:hidden">↓</span>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------- CUSTOM */}
      {config.sections.custom && (
        <section className="border-y border-charcoal-400/10 bg-charcoal-950/40 py-12 sm:py-16">
          <div className="lz-container grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:items-center">
            <Reveal>
              <div>
                <p className="lz-eyebrow mb-3">Votre projet, votre format</p>
                <h2 className="lz-h2">{config.content.customTitle}</h2>
                <p className="lz-lead mt-4 max-w-xl">
                  Envoyez votre modèle 3D, une photo ou une simple description. L’atelier analyse le
                  fichier, estime le volume, le temps d’impression et vous propose un devis clair.
                </p>
                <ul className="mt-6 grid gap-2.5 text-sm text-charcoal-300 sm:grid-cols-2">
                  {[
                    'Fichiers GLB, GLTF, STL, OBJ, 3MF',
                    'Analyse automatique des dimensions',
                    'Estimation de matière et de durée',
                    'Devis révisable avant fabrication',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link to="/boutique/sur-mesure" className="btn-primary">
                    Demander une fabrication <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link to="/boutique/sur-mesure/suivi" className="btn-secondary">
                    Suivre ma demande
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal delay={110}>
              <div className="lz-panel p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 border-b border-charcoal-400/10 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red-light"><FileBox className="h-4 w-4" /></span>
                    <div>
                      <p className="text-xs font-bold text-offwhite">Analyse de fichier</p>
                      <p className="text-[10px] text-charcoal-400">Estimation indicative</p>
                    </div>
                  </div>
                  <span className="lz-badge lz-badge-ok">Automatique</span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {[
                    ['Dimensions', '84 × 52 × 31 mm'],
                    ['Volume de matière', '38 g'],
                    ['Temps d’impression', '4 h 20'],
                    ['Finition', 'Couche 0,2 mm'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-charcoal-400/10 bg-charcoal-900/50 px-3.5 py-2.5">
                      <span className="text-xs text-charcoal-400">{label}</span>
                      <span className="text-xs font-semibold text-offwhite">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-charcoal-500">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-red-light" />
                  Exemple d’estimation. Le devis final est confirmé par l’atelier après vérification
                  du modèle et du matériau.
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------- LATEST */}
      {config.sections.latest && (
        <section className="lz-container py-12 sm:py-16">
          <Reveal>
            <SectionHeading
              eyebrow="À découvrir"
              title={config.content.latestTitle}
              description="Les dernières pièces ajoutées à l’atelier."
              action={
                <Link
                  to="/boutique/produits?sort=newest"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red-light transition hover:text-offwhite"
                >
                  Voir le catalogue <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
          </Reveal>
          <div className="mt-7">
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-charcoal-400/10 bg-charcoal-800/60" />
                ))}
              </div>
            ) : failed ? (
              <div className="lz-card px-5 py-14 text-center" role="alert">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-brand-red" />
                <p className="text-charcoal-300">Impossible de charger les produits pour le moment.</p>
                <p className="mt-1 text-xs text-charcoal-500">Vérifiez votre connexion, puis réessayez.</p>
                <button type="button" onClick={() => void loadCatalogue()} className="btn-ghost mx-auto mt-4">
                  <RefreshCw className="h-4 w-4" /> Réessayer
                </button>
              </div>
            ) : recent.length === 0 ? (
              <div className="lz-card px-5 py-14 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-charcoal-500" />
                <p className="text-charcoal-300">La boutique ouvre bientôt.</p>
                <p className="mt-1 text-xs text-charcoal-500">En attendant, vous pouvez lancer une fabrication sur mesure.</p>
                <Link to="/boutique/sur-mesure" className="btn-primary mt-5">Lancer un projet</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {recent.map((product, index) => (
                  <Reveal key={product.id} delay={index * 40}>
                    <ProductCard product={product} imageUrl={primaryImage(product)} />
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <RecentlyViewedProducts />

      {/* ----------------------------------------------------------- FINAL CTA */}
      {config.sections.finalCta && (
        <section className="lz-container pb-16 sm:pb-20">
          <Reveal>
            <div className="relative overflow-hidden rounded-[1.75rem] border border-brand-red/20 bg-charcoal-950/70 p-7 sm:p-10">
              <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand-red/15 blur-3xl" />
              <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-1/2 opacity-40 lg:block">
                <div className="lz-layers h-full w-full" />
              </div>
              <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
                <div className="max-w-xl">
                  <p className="lz-eyebrow mb-3">Prêt à commencer ?</p>
                  <h2 className="lz-h2">{config.content.ctaTitle}</h2>
                  <p className="lz-lead mt-2">{config.content.ctaDescription}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <Link to="/boutique/produits" className="btn-primary">
                    Découvrir LUNDER <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link to="/boutique/sur-mesure" className="btn-secondary">Créer sur mesure</Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      )}
    </div>
  )
}
