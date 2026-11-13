import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Printer, Menu, X, ShoppingCart, Search } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useCart } from '@/lib/cart'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/url'
import { toMailtoHref, toTelHref, toWhatsAppHref } from '@/lib/contact'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-brand-red' : 'text-charcoal-200 hover:text-offwhite'}`

const SOCIAL_LABELS: Record<string, string> = {
  instagram_url: 'Instagram',
  facebook_url: 'Facebook',
  tiktok_url: 'TikTok',
}

export default function StoreLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const { count } = useCart()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase
      .from('store_settings')
      .select('key, value')
      .eq('is_public', true)
      .then(({ data, error }) => {
        // Un réglage indisponible ne doit jamais casser la boutique : on garde
        // les valeurs par défaut et on continue.
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
      })
  }, [])

  const telHref = toTelHref(settings.phone)
  const whatsappHref = toWhatsAppHref(settings.whatsapp || settings.phone)
  const mailHref = toMailtoHref(settings.email)

  // Les liens externes ne sont rendus que si l'URL est réellement http(s).
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

  return (
    <div className="min-h-screen bg-charcoal-900 text-offwhite">
      <header className="sticky top-0 z-50 border-b border-charcoal-400/10 bg-charcoal-900/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/boutique" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red">
              <Printer className="h-5 w-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold tracking-wide text-offwhite">LUNDER'S 3D STUDIO</div>
              <div className="text-[10px] font-medium tracking-widest text-charcoal-300">DESIGN · PRINT · CREATE</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <NavLink to="/boutique" end className={navLinkClass}>
              Accueil
            </NavLink>
            <NavLink to="/boutique/produits" className={navLinkClass}>
              Boutique
            </NavLink>
            <NavLink to="/boutique/sur-mesure" className={navLinkClass}>
              Sur mesure
            </NavLink>
            <NavLink to="/boutique/suivi" className={navLinkClass}>
              Suivre ma commande
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/boutique/panier"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-charcoal-200 transition-colors hover:text-offwhite"
              aria-label={`Panier${count > 0 ? `, ${count} article(s)` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
            <button
              className="btn-ghost hidden md:inline-flex"
              aria-label="Rechercher"
              aria-expanded={searchOpen}
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
              type="button"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <form onSubmit={submitSearch} className="hidden border-t border-charcoal-400/10 px-4 py-3 md:block" role="search">
            <div className="relative mx-auto max-w-3xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
              <input
                type="search"
                value={searchTerm}
                autoFocus
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Rechercher un produit..."
                aria-label="Rechercher un produit"
                className="input-field pl-10"
              />
            </div>
          </form>
        )}

        {mobileOpen && (
          <nav className="border-t border-charcoal-400/10 bg-charcoal-900 px-4 py-3 md:hidden">
            <form onSubmit={submitSearch} className="mb-2" role="search">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Rechercher un produit..."
                aria-label="Rechercher un produit"
                className="input-field"
              />
            </form>
            <NavLink
              to="/boutique"
              end
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium text-charcoal-200"
            >
              Accueil
            </NavLink>
            <NavLink
              to="/boutique/produits"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium text-charcoal-200"
            >
              Boutique
            </NavLink>
            <NavLink
              to="/boutique/sur-mesure"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium text-charcoal-200"
            >
              Sur mesure
            </NavLink>
            <NavLink
              to="/boutique/suivi"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium text-charcoal-200"
            >
              Suivre ma commande
            </NavLink>
          </nav>
        )}
      </header>

      <main className="min-h-[calc(100vh-4rem)]">
        <Outlet />
      </main>

      <footer className="border-t border-charcoal-400/10 bg-charcoal-950 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red">
                <Printer className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold tracking-wide">LUNDER'S 3D STUDIO</span>
            </div>
            <p className="text-xs text-charcoal-400">DESIGN · PRINT · CREATE — From Imagination to Reality</p>
            <p className="text-xs text-charcoal-500">Algérie · Paiement à la livraison</p>
            {(telHref || whatsappHref || mailHref) && (
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
                {telHref && (
                  <a href={telHref} className="text-charcoal-300 underline-offset-4 hover:text-offwhite hover:underline">
                    {settings.phone}
                  </a>
                )}
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-charcoal-300 underline-offset-4 hover:text-offwhite hover:underline"
                  >
                    WhatsApp
                  </a>
                )}
                {mailHref && (
                  <a href={mailHref} className="text-charcoal-300 underline-offset-4 hover:text-offwhite hover:underline">
                    {settings.email}
                  </a>
                )}
              </div>
            )}
            {socials.length > 0 && (
              <div className="flex flex-wrap justify-center gap-4">
                {socials.map((social) => (
                  <a
                    key={social.key}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-charcoal-300 underline-offset-4 hover:text-offwhite hover:underline"
                  >
                    {social.label}
                  </a>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/boutique/suivi" className="text-xs text-charcoal-400 underline-offset-4 hover:text-offwhite hover:underline">
                Suivre ma commande
              </Link>
              <Link to="/boutique/informations" className="text-xs text-charcoal-400 underline-offset-4 hover:text-offwhite hover:underline">
                Informations et politiques
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
