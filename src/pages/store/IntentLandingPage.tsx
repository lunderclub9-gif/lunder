import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Box, CheckCircle2, Gift, Layers3, Package, Printer, Sparkles, Upload } from 'lucide-react'
import { supabase, type Product } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'

type IntentKey = 'decorer' | 'offrir' | 'prototyper' | 'personnaliser'

type IntentConfig = {
  eyebrow: string
  title: string
  highlight: string
  description: string
  terms: string[]
  icon: typeof Sparkles
  accent: string
  steps: { title: string; text: string }[]
  checklist: string[]
  cta: string
  ctaTo: string
}

const INTENTS: Record<IntentKey, IntentConfig> = {
  decorer: {
    eyebrow: 'PARCOURS DÉCORER',
    title: 'Donnez du caractère',
    highlight: 'à votre espace.',
    description: 'Des objets qui ajoutent une présence, un détail ou une fonction à une pièce. Commencez par une inspiration, puis trouvez une création qui vous ressemble.',
    terms: ['deco', 'décor', 'lampe', 'maison', 'support', 'objet', 'design'],
    icon: Sparkles,
    accent: 'from-orange-400/20 to-brand-red/10',
    steps: [
      { title: 'Trouvez votre détail', text: 'Explorez les créations disponibles et leurs usages.' },
      { title: 'Projetez-le chez vous', text: 'Vérifiez les dimensions, la matière et la disponibilité.' },
      { title: 'Recevez simplement', text: 'Ajoutez au panier et choisissez votre livraison.' },
    ],
    checklist: ['Objets et accessoires sélectionnés', 'Créations imprimées en Algérie', 'Possibilité de demander une autre taille'],
    cta: 'Voir les créations déco',
    ctaTo: '/boutique/produits',
  },
  offrir: {
    eyebrow: 'PARCOURS OFFRIR',
    title: 'Offrez une pièce',
    highlight: 'qui ne ressemble à aucune autre.',
    description: 'Pour un anniversaire, un bureau ou juste pour faire plaisir : choisissez une création originale et laissez LUNDER s’occuper du reste.',
    terms: ['cadeau', 'figurine', 'collector', 'personnalis', 'décor', 'design'],
    icon: Gift,
    accent: 'from-brand-red/20 to-purple-500/10',
    steps: [
      { title: 'Choisissez une intention', text: 'Une pièce utile, expressive ou simplement belle.' },
      { title: 'Vérifiez le délai', text: 'La fiche indique le stock ou la fabrication sur commande.' },
      { title: 'Faites livrer', text: 'Le paiement à la livraison garde le parcours simple.' },
    ],
    checklist: ['Sélection cadeau à découvrir', 'Prix et disponibilité visibles', 'Suivi de commande après expédition'],
    cta: 'Trouver une idée cadeau',
    ctaTo: '/boutique/produits',
  },
  prototyper: {
    eyebrow: 'PARCOURS PROTOTYPER',
    title: 'Passez de l’idée',
    highlight: 'à une première forme.',
    description: 'Vous avez un fichier, une cote ou un concept ? L’atelier vous aide à transformer une intention en pièce testable, sans vous demander de maîtriser l’impression 3D.',
    terms: [],
    icon: Printer,
    accent: 'from-cyan-400/15 to-brand-red/10',
    steps: [
      { title: 'Transmettez le contexte', text: 'Expliquez l’usage, les dimensions et le résultat attendu.' },
      { title: 'Faites analyser le fichier', text: 'GLB, GLTF, STL et OBJ sont acceptés selon le projet.' },
      { title: 'Validez un devis', text: 'Le studio vérifie la faisabilité avant la fabrication.' },
    ],
    checklist: ['Analyse de fichier 3D', 'Estimation indicative côté serveur', 'Échange avec le studio avant décision'],
    cta: 'Lancer un prototype',
    ctaTo: '/boutique/sur-mesure',
  },
  personnaliser: {
    eyebrow: 'PARCOURS PERSONNALISER',
    title: 'Votre idée,',
    highlight: 'votre version.',
    description: 'Une forme à adapter, une couleur à changer, une série à produire : donnez-nous les contraintes importantes et nous construisons la suite avec vous.',
    terms: ['personnalis', 'sur mesure', 'custom', 'nom', 'logo'],
    icon: Layers3,
    accent: 'from-emerald-400/15 to-brand-red/10',
    steps: [
      { title: 'Décrivez le besoin', text: 'Déposez un fichier, une image ou une description précise.' },
      { title: 'Choisissez les paramètres', text: 'Taille, matière, couleur, quantité et options de production.' },
      { title: 'Suivez la demande', text: 'Un espace de suivi conserve les réponses et les devis.' },
    ],
    checklist: ['Une ou plusieurs pièces par demande', 'Dimensions et matières guidées', 'Demande suivie par un token sécurisé'],
    cta: 'Décrire mon projet',
    ctaTo: '/boutique/sur-mesure',
  },
}

function normalize(value: string) {
  return value.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export default function IntentLandingPage() {
  const { intent } = useParams<{ intent: string }>()
  const intentKey: IntentKey = typeof intent === 'string' && intent in INTENTS ? intent as IntentKey : 'decorer'
  const config = INTENTS[intentKey]
  const Icon = config.icon
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(config.terms.length > 0)

  useEffect(() => {
    if (config.terms.length === 0) return
    let active = true
    void supabase
      .from('products')
      .select('*, category:categories(*), product_images(*)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(24)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setProducts([])
        } else {
          setProducts((data as Product[]) ?? [])
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [config.terms])

  const recommendations = useMemo(() => {
    const terms = config.terms.map(normalize)
    const matches = products.filter((product) => {
      const haystack = normalize([product.name, product.description ?? '', product.category?.name ?? ''].join(' '))
      return terms.some((term) => haystack.includes(term))
    })
    return { items: (matches.length > 0 ? matches : products).slice(0, 4), isFallback: matches.length === 0 && products.length > 0 }
  }, [config.terms, products])

  return (
    <div className="min-h-screen">
      <section className={`relative overflow-hidden border-b border-charcoal-400/10 bg-gradient-to-br ${config.accent} from-charcoal-950 via-charcoal-950 to-charcoal-900`}>
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.12)_1px,transparent_0)] [background-size:28px_28px]" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Link to="/boutique" className="text-xs font-semibold text-charcoal-400 transition hover:text-white">← Retour à l’atelier</Link>
          <div className="mt-10 max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-[10px] font-bold tracking-[0.18em] text-brand-red-light"><Icon className="h-4 w-4" /> {config.eyebrow}</div>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-offwhite sm:text-6xl">{config.title}<span className="block bg-gradient-to-r from-brand-red-light to-orange-300 bg-clip-text text-transparent">{config.highlight}</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-charcoal-300 sm:text-lg">{config.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link to={config.ctaTo} className="btn-primary min-h-12">{config.cta} <ArrowRight className="h-4 w-4" /></Link><Link to="/boutique/suivi" className="btn-secondary min-h-12">Voir comment ça se passe</Link></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {config.steps.map((step, index) => <div key={step.title} className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/40 p-5"><span className="font-mono text-xs font-bold text-brand-red-light">0{index + 1}</span><h2 className="mt-8 text-sm font-bold text-offwhite">{step.title}</h2><p className="mt-2 text-xs leading-6 text-charcoal-400">{step.text}</p></div>)}
        </div>
        <div className="mt-10 grid gap-8 rounded-3xl border border-charcoal-400/15 bg-charcoal-800/25 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"><div><p className="text-xs font-bold tracking-[0.18em] text-brand-red-light">CE QUE L’ATELIER VOUS APPORTE</p><h2 className="mt-2 text-2xl font-bold text-offwhite">Un cadre clair avant de fabriquer.</h2></div><div className="grid gap-3 sm:grid-cols-3">{config.checklist.map((item) => <div key={item} className="flex gap-2 text-xs leading-5 text-charcoal-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />{item}</div>)}</div></div>
      </section>

      {config.terms.length > 0 && <section className="border-y border-charcoal-400/10 bg-charcoal-950/60"><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold tracking-[0.18em] text-brand-red-light">SÉLECTION POUR VOUS</p><h2 className="text-2xl font-bold text-offwhite">{recommendations.isFallback ? 'Une sélection de l’atelier' : 'Des créations dans cet univers'}</h2><p className="mt-2 text-sm text-charcoal-400">{loading ? 'Recherche dans le catalogue…' : recommendations.isFallback ? 'Les mots-clés ne suffisent pas encore : voici les dernières pièces disponibles.' : 'Basée sur les noms, descriptions et catégories du catalogue actuel.'}</p></div><Link to="/boutique/produits" className="hidden text-sm font-semibold text-brand-red-light hover:text-white sm:inline-flex">Tout le catalogue <ArrowRight className="ml-1 h-4 w-4" /></Link></div>{loading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="h-56 animate-pulse rounded-2xl bg-charcoal-800" /><div className="h-56 animate-pulse rounded-2xl bg-charcoal-800" /><div className="h-56 animate-pulse rounded-2xl bg-charcoal-800" /><div className="h-56 animate-pulse rounded-2xl bg-charcoal-800" /></div> : recommendations.items.length > 0 ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">{recommendations.items.map((product) => <ProductCard key={product.id} product={product} imageUrl={product.product_images?.find((image) => image.is_primary)?.image_url ?? product.product_images?.[0]?.image_url} />)}</div> : <div className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/40 p-8 text-center"><Package className="mx-auto h-8 w-8 text-charcoal-500" /><p className="mt-3 text-sm text-charcoal-300">Le catalogue est en préparation.</p><Link to={config.ctaTo} className="btn-secondary mt-5">Parler à l’atelier</Link></div>}</div></section>}

      {config.terms.length === 0 && <section className="border-y border-charcoal-400/10 bg-charcoal-950/60"><div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8"><div className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/35 p-5"><Upload className="h-6 w-6 text-brand-red-light" /><h2 className="mt-8 text-sm font-bold text-offwhite">Un fichier ou une idée</h2><p className="mt-2 text-xs leading-6 text-charcoal-400">Commencez avec ce que vous avez. Le formulaire vous indique les formats et informations utiles.</p></div><div className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/35 p-5"><Box className="h-6 w-6 text-brand-red-light" /><h2 className="mt-8 text-sm font-bold text-offwhite">Une estimation lisible</h2><p className="mt-2 text-xs leading-6 text-charcoal-400">Les dimensions, la matière et la quantité structurent une première estimation.</p></div><div className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/35 p-5"><Layers3 className="h-6 w-6 text-brand-red-light" /><h2 className="mt-8 text-sm font-bold text-offwhite">Un studio derrière l’écran</h2><p className="mt-2 text-xs leading-6 text-charcoal-400">Le prix final est confirmé après vérification du projet et de sa faisabilité.</p></div></div></section>}
    </div>
  )
}
