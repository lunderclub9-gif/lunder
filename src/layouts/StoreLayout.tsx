import { Link, Outlet, NavLink } from 'react-router-dom'
import { Printer, Search, Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function StoreLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

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
            <NavLink to="/boutique" end className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-brand-red' : 'text-charcoal-200 hover:text-offwhite'}`}>
              Accueil
            </NavLink>
            <NavLink to="/boutique/produits" className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-brand-red' : 'text-charcoal-200 hover:text-offwhite'}`}>
              Boutique
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <button className="btn-ghost hidden md:inline-flex" aria-label="Rechercher">
              <Search className="h-5 w-5" />
            </button>
            <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-charcoal-400/10 bg-charcoal-900 px-4 py-3 md:hidden">
            <NavLink to="/boutique" end onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-charcoal-200">
              Accueil
            </NavLink>
            <NavLink to="/boutique/produits" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-charcoal-200">
              Boutique
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
          </div>
        </div>
      </footer>
    </div>
  )
}
