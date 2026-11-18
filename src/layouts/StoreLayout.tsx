import { Link, Outlet, NavLink } from 'react-router-dom'
import {
  Printer, Menu, X, ShoppingCart, Search, Phone, MessageCircle, Mail,
  Instagram, Facebook, Music2, UserRound, ArrowUpRight, Sparkles, Home,
  Grid2X2, Boxes, ArrowRight, ShieldCheck, Heart,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCart } from '@/lib/cart'
import { useWishlist } from '@/lib/wishlist'
import StoreSearch from '@/components/store/StoreSearch'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/url'
import { toMailtoHref, toTelHref, toWhatsAppHref } from '@/lib/contact'
import {
  DEFAULT_VISUAL_IDENTITY, normalizeVisualIdentity, parseVisualIdentity,
  visualIdentityCssVars, VisualIdentityProvider, type VisualIdentity,
} from '@/lib/visual-identity'

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

const dockNavigation = [
  { to: '/boutique', label: 'Accueil', icon: Home, end: true },
  { to: '/boutique/produits', label: 'Boutique', icon: Grid2X2 },
  { to: '/boutique/sur-mesure', label: 'Sur mesure', icon: Boxes },
  { to: '/boutique/panier', label: 'Panier', icon: ShoppingCart },
]

export default function StoreLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { count } = useCart()
  const { count: wishlistCount } = useWishlist()
  const { session } = useAuth()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [visualIdentity, setVisualIdentity] = useState<VisualIdentity>(DEFAULT_VISUAL_IDENTITY)

  // Aperçu temps réel du Visual Identity Studio : le studio affiche cette page
  // dans une iframe et pousse la configuration en cours d'édition.
  const isDraftPreview = useMemo(
    () => new URLSearchParams(window.location.search).get('viPreview') === '1',
    []
  )

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
      // En mode aperçu, le studio pousse le brouillon : ne jamais le remplacer
      // par l'identité publiée si la requête se termine après le postMessage.
      if (!isDraftPreview) setVisualIdentity(parseVisualIdentity(next.visual_identity))
    })
  }, [isDraftPreview])

  useEffect(() => {
    if (!isDraftPreview) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data as { type?: string; config?: unknown } | null
      if (!payload || payload.type !== 'lunder:visual-identity-preview') return
      setVisualIdentity(normalizeVisualIdentity(payload.config))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isDraftPreview])

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

  const closeMenus = () => {
    setMobileOpen(false)
    setSearchOpen(false)
  }

  return (
    <VisualIdentityProvider value={visualIdentity}>
      <div
        className="store-shell min-h-screen text-offwhite"
        style={visualIdentityCssVars(visualIdentity)}
        data-motion={visualIdentity.motion.enabled ? 'true' : 'false'}
        data-motion-style={visualIdentity.motion.style}
        data-mobile-reduce={visualIdentity.motion.mobileReduce ? 'true' : 'false'}
      >
        <a
          href="#main-content"
          className="sr-only z-[60] rounded-lg bg-white px-4 py-3 text-sm font-semibold text-charcoal-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Aller au contenu
        </a>

        <div className="store-utility-bar hidden sm:block">
          <div className="lz-container flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-brand-red-light" />
              Design · Print · Create
            </span>
            <span className="hidden md:inline">Fabrication et livraison en Algérie</span>
            <Link
              to="/boutique/sur-mesure"
              className="inline-flex shrink-0 items-center gap-1 text-offwhite transition hover:text-brand-red-light"
            >
              Parler à l’atelier <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <header className="store-header sticky top-0 z-50">
          <div className="lz-container flex h-[4.25rem] items-center justify-between gap-4">
            <Link to="/boutique" className="store-brand group flex min-w-0 items-center gap-3" onClick={closeMenus}>
              {visualIdentity.assets.logo ? (
                <img
                  src={visualIdentity.assets.logo}
                  alt="LUNDER'S 3D STUDIO"
                  className={visualIdentity.assets.mobileLogo ? 'hidden h-9 max-w-40 object-contain sm:block' : 'h-9 max-w-40 object-contain'}
                />
              ) : (
                <span className="store-brand-mark">
                  <Printer className="h-5 w-5 text-white" />
                </span>
              )}
              {visualIdentity.assets.mobileLogo && (
                <img src={visualIdentity.assets.mobileLogo} alt="LUNDER" className="h-8 w-8 object-contain sm:hidden" />
              )}
              <span className="block min-w-0">
                <span className="block truncate text-[12px] font-black tracking-[0.09em] text-offwhite sm:text-[13px]">
                  LUNDER’S 3D STUDIO
                </span>
                <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.24em] text-charcoal-400">
                  Atelier d’impression 3D
                </span>
              </span>
            </Link>

            <nav className="hidden items-center gap-8 lg:flex" aria-label="Navigation principale">
              {navigation.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                className="store-icon-button hidden md:inline-flex"
                aria-label="Rechercher"
                aria-expanded={searchOpen}
                aria-controls="store-search"
                type="button"
                onClick={() => setSearchOpen((open) => !open)}
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <Link
                to="/boutique/favoris"
                className="store-icon-button relative hidden sm:inline-flex"
                aria-label={`Mes favoris${wishlistCount > 0 ? `, ${wishlistCount} pièce(s)` : ''}`}
              >
                <Heart className="h-[18px] w-[18px]" />
                {wishlistCount > 0 && <span className="store-cart-count">{wishlistCount > 9 ? '9+' : wishlistCount}</span>}
              </Link>
              <Link
                to="/boutique/compte"
                className="store-icon-button hidden sm:inline-flex"
                aria-label={session ? 'Ouvrir mon espace' : 'Se connecter'}
              >
                <UserRound className="h-[18px] w-[18px]" />
              </Link>
              <Link
                to="/boutique/panier"
                className="store-icon-button relative"
                aria-label={`Panier${count > 0 ? `, ${count} article(s)` : ''}`}
              >
                <ShoppingCart className="h-[18px] w-[18px]" />
                {count > 0 && <span className="store-cart-count">{count > 99 ? '99+' : count}</span>}
              </Link>
              <button
                className="store-icon-button lg:hidden"
                onClick={() => setMobileOpen((open) => !open)}
                aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
                type="button"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {searchOpen && (
            <div id="store-search" className="border-t border-charcoal-400/10">
              <div className="lz-container py-3.5">
                <div className="mx-auto max-w-3xl">
                  <StoreSearch autoFocus onClose={() => setSearchOpen(false)} />
                </div>
              </div>
            </div>
          )}

          {mobileOpen && (
            <nav
              id="mobile-navigation"
              className="store-mobile-nav px-4 py-4 lg:hidden"
              aria-label="Navigation mobile"
            >
              <div className="mb-4">
                <StoreSearch idPrefix="mobile" onClose={() => setMobileOpen(false)} />
              </div>
              <div className="grid gap-1">
                {navigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={closeMenus}
                    className={({ isActive }) =>
                      `rounded-xl px-3 py-3 text-sm font-semibold transition ${
                        isActive ? 'bg-brand-red/10 text-brand-red-light' : 'text-charcoal-200 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
                <NavLink
                  to="/boutique/favoris"
                  onClick={closeMenus}
                  className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-charcoal-200 transition hover:bg-white/5 hover:text-white"
                >
                  <Heart className="h-4 w-4" /> Mes favoris
                  {wishlistCount > 0 && <span className="rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-bold text-white">{wishlistCount}</span>}
                </NavLink>
                <NavLink
                  to="/boutique/compte"
                  onClick={closeMenus}
                  className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-charcoal-200 transition hover:bg-white/5 hover:text-white"
                >
                  <UserRound className="h-4 w-4" /> {session ? 'Mon espace' : 'Connexion / inscription'}
                </NavLink>
              </div>
              <Link to="/boutique/sur-mesure" onClick={closeMenus} className="btn-primary mt-4 w-full">
                Lancer un projet <ArrowRight className="h-4 w-4" />
              </Link>
              {(whatsappHref || telHref) && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-charcoal-400/10 pt-4 text-xs text-charcoal-400">
                  {whatsappHref && (
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="lz-chip">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                  {telHref && (
                    <a href={telHref} className="lz-chip">
                      <Phone className="h-3.5 w-3.5" /> Appeler
                    </a>
                  )}
                </div>
              )}
            </nav>
          )}
        </header>

        <main id="main-content" tabIndex={-1} className="min-h-[60vh]">
          <Outlet />
        </main>

        <footer className="store-footer">
          {visualIdentity.assets.footerImage && (
            <div className="relative h-40 overflow-hidden border-b border-charcoal-400/10 sm:h-52">
              <img
                src={visualIdentity.assets.footerImage}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="h-full w-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950 via-charcoal-950/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0">
                <div className="lz-container pb-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand-red-light">LUNDER · Atelier 3D</p>
                  <p className="mt-1 max-w-md text-sm text-charcoal-200">Des pièces pensées, dessinées et fabriquées en Algérie.</p>
                </div>
              </div>
            </div>
          )}
          <div className="lz-container py-12 lg:py-16">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_0.65fr_0.65fr_1fr]">
              <div>
                <div className="flex items-center gap-3">
                  {visualIdentity.assets.logo ? (
                    <img src={visualIdentity.assets.logo} alt="LUNDER'S 3D STUDIO" className="h-9 max-w-36 object-contain" />
                  ) : (
                    <span className="store-brand-mark h-9 w-9">
                      <Printer className="h-4 w-4 text-white" />
                    </span>
                  )}
                  <span className="text-sm font-black tracking-[0.08em]">LUNDER’S 3D STUDIO</span>
                </div>
                <p className="mt-5 max-w-sm text-sm leading-7 text-charcoal-400">
                  Un atelier de design et de fabrication 3D : pièces du catalogue, prototypes et
                  fabrications sur mesure. De l’idée à l’objet, avec un suivi clair.
                </p>
                <p className="mt-5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-red-light">
                  <span className="lz-layers w-10" aria-hidden="true" /> Design · Print · Create
                </p>
              </div>

              <div>
                <p className="footer-heading">Explorer</p>
                <div className="mt-4 grid gap-3">
                  <Link to="/boutique/produits" className="footer-link">La boutique</Link>
                  <Link to="/boutique/sur-mesure" className="footer-link">Fabrication sur mesure</Link>
                  <Link to="/boutique/produits?sort=newest" className="footer-link">Nouveautés</Link>
                  <Link to="/boutique/informations" className="footer-link">Informations et politiques</Link>
                </div>
              </div>

              <div>
                <p className="footer-heading">Votre commande</p>
                <div className="mt-4 grid gap-3">
                  <Link to="/boutique/panier" className="footer-link">Panier</Link>
                  <Link to="/boutique/favoris" className="footer-link">Mes favoris</Link>
                  <Link to="/boutique/suivi" className="footer-link">Suivre une commande</Link>
                  <Link to="/boutique/compte" className="footer-link">Espace client</Link>
                  <Link to="/boutique/sur-mesure/suivi" className="footer-link">Suivi d’une demande</Link>
                </div>
              </div>

              <div>
                <p className="footer-heading">Parler à l’atelier</p>
                <p className="mt-4 text-sm leading-6 text-charcoal-400">
                  Une question sur une pièce, une matière ou un projet ? Nous vous répondons.
                </p>
                <div className="mt-4 grid gap-2 text-sm">
                  {telHref && (
                    <a href={telHref} className="footer-link inline-flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-brand-red-light" /> {settings.phone}
                    </a>
                  )}
                  {mailHref && (
                    <a href={mailHref} className="footer-link inline-flex items-center gap-2 break-all">
                      <Mail className="h-3.5 w-3.5 text-brand-red-light" /> {settings.email}
                    </a>
                  )}
                </div>
                {(whatsappHref || socials.length > 0) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {whatsappHref && (
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Contacter sur WhatsApp"
                        className="footer-social"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                    {socials.map((social) => {
                      const Icon = social.key === 'instagram_url' ? Instagram : social.key === 'facebook_url' ? Facebook : Music2
                      return (
                        <a
                          key={social.key}
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Visiter ${social.label}`}
                          className="footer-social"
                        >
                          <Icon className="h-4 w-4" />
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12 flex flex-col gap-3 border-t border-charcoal-400/10 pt-5 text-[11px] text-charcoal-500 sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} LUNDER’S 3D STUDIO · Algérie</span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Paiement à la livraison · Livraison selon disponibilité
              </span>
            </div>
          </div>
        </footer>

        <nav className="store-dock lg:hidden" aria-label="Navigation rapide">
          {dockNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="store-dock-link relative"
            >
              <item.icon className="h-[19px] w-[19px]" />
              <span>{item.label}</span>
              {item.to === '/boutique/panier' && count > 0 && (
                <span className="absolute right-[calc(50%-1.3rem)] top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-bold text-white">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </VisualIdentityProvider>
  )
}
