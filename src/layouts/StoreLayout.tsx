import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Printer, Menu, X, ShoppingCart, Search, Phone, MessageCircle, Mail, Instagram, Facebook, Music2, UserRound, ArrowUpRight, Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useCart } from '@/lib/cart'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/url'
import { toMailtoHref, toTelHref, toWhatsAppHref } from '@/lib/contact'
import { DEFAULT_VISUAL_IDENTITY, parseVisualIdentity, visualIdentityCssVars, VisualIdentityProvider, type VisualIdentity } from '@/lib/visual-identity'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `store-nav-link ${isActive ? 'store-nav-link-active' : ''}`

const SOCIAL_LABELS: Record<string, string> = {
  instagram_url: 'Instagram',
  facebook_url: 'Facebook',
  tiktok_url: 'TikTok',
}

const navigation = [
  { to: '/boutique', label: 'Accueil', end: true },
  { to: '/boutique/produits', label: 'La boutique' },
  { to: '/boutique/sur-mesure', label: 'Fabrication sur mesure' },
  { to: '/boutique/suivi', label: 'Suivre une commande' },
]

export default function StoreLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const { count } = useCart()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [visualIdentity, setVisualIdentity] = useState<VisualIdentity>(DEFAULT_VISUAL_IDENTITY)

  useEffect(() => {
    supabase.from('store_settings').select('key, value').eq('is_public', true).then(({ data, error }) => {
      if (error) {
        console.error('[LUNDER] réglages de la boutique indisponibles')
        setSettings({})
        return
      }
      const next: Record<string, string> = {}
      ;((data as { key: string; value: string | null }[]) ?? []).forEach((row) => {
        if (row.value) next[row.key] = row.value
      })
      setSettings(next)
      setVisualIdentity(parseVisualIdentity(next.visual_identity))
    })
  }, [])

  const telHref = toTelHref(settings.phone)
  const whatsappHref = toWhatsAppHref(settings.whatsapp || settings.phone)
  const mailHref = toMailtoHref(settings.email)

  useEffect(() => {
    if (!mobileOpen && !searchOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen, searchOpen])

  const socials = Object.keys(SOCIAL_LABELS)
    .map((key) => ({ key, label: SOCIAL_LABELS[key], url: safeExternalUrl(settings[key]) }))
    .filter((social): social is { key: string; label: string; url: string } => Boolean(social.url))

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const term = searchTerm.trim()
    setSearchOpen(false)
    setMobileOpen(false)
    navigate(term ? `/boutique/produits?q=${encodeURIComponent(term)}` : '/boutique/produits')
  }

  const closeMenus = () => {
    setMobileOpen(false)
    setSearchOpen(false)
  }

  return (
    <VisualIdentityProvider value={visualIdentity}>
      <div className="store-shell min-h-screen bg-charcoal-900 text-offwhite" style={visualIdentityCssVars(visualIdentity)} data-motion={visualIdentity.motion.enabled ? 'true' : 'false'} data-motion-style={visualIdentity.motion.style} data-mobile-reduce={visualIdentity.motion.mobileReduce ? 'true' : 'false'}>
        <a href="#main-content" className="sr-only z-[60] rounded-lg bg-white px-4 py-3 text-sm font-semibold text-charcoal-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Aller au contenu</a>
        <div className="store-utility-bar"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"><span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-brand-red-light" /> Design · Print · Create</span><span className="hidden sm:inline">Fabrication et livraison en Algérie</span><Link to="/boutique/sur-mesure" className="inline-flex items-center gap-1 text-offwhite hover:text-brand-red-light">Parler à l’atelier <ArrowUpRight className="h-3 w-3" /></Link></div></div>
        <header className="store-header sticky top-0 z-50 border-b border-charcoal-400/10 bg-charcoal-900/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link to="/boutique" className="store-brand group flex min-w-0 items-center gap-3" onClick={closeMenus}>
              {visualIdentity.assets.logo ? <img src={visualIdentity.assets.logo} alt="LUNDER'S 3D STUDIO" className={visualIdentity.assets.mobileLogo ? 'hidden h-10 max-w-40 object-contain sm:block' : 'h-10 max-w-40 object-contain'} /> : <span className="store-brand-mark"><Printer className="h-5 w-5 text-white" /></span>}
              {visualIdentity.assets.mobileLogo && <img src={visualIdentity.assets.mobileLogo} alt="LUNDER" className="h-9 w-9 object-contain sm:hidden" />}
              <span className="block min-w-0"><span className="block truncate text-[11px] font-black tracking-[0.08em] text-offwhite sm:text-sm">LUNDER'S 3D STUDIO</span><span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-charcoal-400">Studio de fabrication</span></span>
            </Link>

            <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
              {navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>{item.label}</NavLink>)}
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button className="store-icon-button hidden md:inline-flex" aria-label="Rechercher" aria-expanded={searchOpen} type="button" onClick={() => setSearchOpen((open) => !open)}><Search className="h-[18px] w-[18px]" /></button>
              <Link to="/boutique/compte" className="store-icon-button hidden sm:inline-flex" aria-label={session ? 'Ouvrir mon espace' : 'Se connecter'}><UserRound className="h-[18px] w-[18px]" /></Link>
              <Link to="/boutique/panier" className="store-icon-button relative" aria-label={`Panier${count > 0 ? `, ${count} article(s)` : ''}`}><ShoppingCart className="h-[18px] w-[18px]" />{count > 0 && <span className="store-cart-count">{count}</span>}</Link>
              <button className="store-icon-button lg:hidden" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={mobileOpen} aria-controls="mobile-navigation" type="button">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
            </div>
          </div>

          {searchOpen && <form onSubmit={submitSearch} className="border-t border-charcoal-400/10 px-4 py-3" role="search"><div className="relative mx-auto max-w-3xl"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" /><input type="search" value={searchTerm} autoFocus onChange={(event) => setSearchTerm(event.target.value)} placeholder="Rechercher une création, une matière…" aria-label="Rechercher un produit" className="input-field min-h-12 pl-11" /></div></form>}

          {mobileOpen && <nav id="mobile-navigation" className="border-t border-charcoal-400/10 bg-charcoal-950 px-4 py-4 lg:hidden" aria-label="Navigation mobile">
            <form onSubmit={submitSearch} className="mb-4" role="search"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Rechercher dans la boutique" aria-label="Rechercher un produit" className="input-field pl-11" /></div></form>
            <div className="grid gap-1">{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMenus} className={({ isActive }) => `rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-brand-red/10 text-brand-red-light' : 'text-charcoal-200 hover:bg-white/5 hover:text-white'}`}>{item.label}</NavLink>)}<NavLink to="/boutique/compte" onClick={closeMenus} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-charcoal-200 hover:bg-white/5 hover:text-white"><UserRound className="h-4 w-4" /> {session ? 'Mon espace' : 'Connexion / inscription'}</NavLink></div>
            <Link to="/boutique/sur-mesure" onClick={closeMenus} className="btn-primary mt-4 w-full">Lancer un projet <ArrowRightIcon /></Link>
          </nav>}
        </header>

        <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4.5rem)]"><Outlet /></main>

        <footer className="store-footer border-t border-charcoal-400/10 bg-charcoal-950">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-10 lg:grid-cols-[1.35fr_0.7fr_0.7fr_1fr]">
              <div><div className="flex items-center gap-3">{visualIdentity.assets.logo ? <img src={visualIdentity.assets.logo} alt="LUNDER'S 3D STUDIO" className="h-9 max-w-36 object-contain" /> : <span className="store-brand-mark h-9 w-9"><Printer className="h-4 w-4 text-white" /></span>}<span className="text-sm font-black tracking-[0.08em]">LUNDER'S 3D STUDIO</span></div><p className="mt-5 max-w-sm text-sm leading-7 text-charcoal-400">Des objets qui ont une fonction, une histoire ou simplement une bonne idée derrière eux. Conçus et fabriqués en Algérie.</p><p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-red-light">Design · Print · Create</p></div>
              <div><p className="footer-heading">Explorer</p><div className="mt-4 grid gap-3">{navigation.slice(0, 3).map((item) => <Link key={item.to} to={item.to} className="footer-link">{item.label}</Link>)}<Link to="/boutique/informations" className="footer-link">Informations et politiques</Link></div></div>
              <div><p className="footer-heading">Votre commande</p><div className="mt-4 grid gap-3"><Link to="/boutique/panier" className="footer-link">Panier</Link><Link to="/boutique/suivi" className="footer-link">Suivre une commande</Link><Link to="/boutique/compte" className="footer-link">Espace client</Link><Link to="/boutique/sur-mesure" className="footer-link">Demander un devis</Link></div></div>
              <div><p className="footer-heading">Parler à l’atelier</p><p className="mt-4 text-sm leading-6 text-charcoal-400">Une question sur une pièce, une matière ou un projet ? Nous vous répondons.</p>{(telHref || whatsappHref || mailHref) && <div className="mt-4 flex flex-wrap gap-2">{telHref && <a href={telHref} aria-label={`Appeler ${settings.phone}`} className="footer-social"><Phone className="h-4 w-4" /></a>}{whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="Contacter sur WhatsApp" className="footer-social"><MessageCircle className="h-4 w-4" /></a>}{mailHref && <a href={mailHref} aria-label={`Envoyer un email à ${settings.email}`} className="footer-social"><Mail className="h-4 w-4" /></a>}{socials.map((social) => { const Icon = social.key === 'instagram_url' ? Instagram : social.key === 'facebook_url' ? Facebook : Music2; return <a key={social.key} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={`Visiter ${social.label}`} className="footer-social"><Icon className="h-4 w-4" /></a> })}</div>}</div>
            </div>
            <div className="mt-12 flex flex-col gap-3 border-t border-charcoal-400/10 pt-5 text-[11px] text-charcoal-500 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} LUNDER’S 3D STUDIO · Algérie</span><span>Paiement à la livraison · Livraison selon disponibilité</span></div>
          </div>
        </footer>
      </div>
    </VisualIdentityProvider>
  )
}

function ArrowRightIcon() { return <span aria-hidden="true">↗</span> }
