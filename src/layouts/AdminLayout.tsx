import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Printer, LayoutDashboard, Package, Tag, LogOut, Menu, X, FileSpreadsheet,
  ShoppingBag, Truck, ClipboardList, Settings, History, Calculator, Coins, Users,
  BarChart3, PanelLeftClose, PanelLeftOpen, Palette, ChevronRight, Plus, Store,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { AdminNotificationsProvider } from '@/components/admin/AdminNotificationsProvider'
import NotificationCenter from '@/components/admin/NotificationCenter'
import { AdminConfirmProvider } from '@/components/admin/AdminConfirmProvider'
import AtelierTabs from '@/components/admin/AtelierTabs'

const ATELIER_ROUTES = [
  '/admin/couts-produits',
  '/admin/tarification',
  '/admin/analyse-fichiers',
  '/admin/calcul-devis',
]

const navGroups = [
  { label: 'Vue d’ensemble', items: [{ to: '/admin/dashboard', label: 'Tableau de bord', icon: LayoutDashboard }] },
  { label: 'Ventes & opérations', items: [
    { to: '/admin/commandes', label: 'Commandes', icon: ShoppingBag },
    { to: '/admin/clients', label: 'Clients', icon: Users },
    { to: '/admin/livraison', label: 'Livraison', icon: Truck },
    { to: '/admin/demandes', label: 'Demandes sur mesure', icon: ClipboardList, badge: true },
  ] },
  { label: 'Catalogue', items: [
    { to: '/admin/produits', label: 'Produits', icon: Package },
    { to: '/admin/categories', label: 'Catégories', icon: Tag },
  ] },
  { label: 'Atelier & tarification', items: [
    { to: '/admin/couts-produits', label: 'Matières premières', icon: Coins },
    { to: '/admin/tarification', label: 'Règles de fabrication', icon: Calculator },
    { to: '/admin/analyse-fichiers', label: 'Analyse de fichiers', icon: FileSpreadsheet },
    { to: '/admin/calcul-devis', label: 'Calculateur de devis', icon: Calculator },
  ] },
  { label: 'Pilotage', items: [{ to: '/admin/finances', label: 'Finances & rentabilité', icon: BarChart3 }] },
  { label: 'Personnalisation', items: [
    { to: '/admin/visual-identity', label: 'Studio visuel', icon: Palette },
    { to: '/admin/parametres', label: 'Paramètres du magasin', icon: Settings },
  ] },
  { label: 'Journal', items: [{ to: '/admin/historique', label: 'Historique', icon: History }] },
]

const routeTitles = navGroups.flatMap((group) => group.items).reduce<Record<string, string>>((result, item) => {
  result[item.to] = item.label
  return result
}, {})

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('lunder-admin-sidebar') === 'collapsed' }
    catch { return false }
  })
  const [newRequests, setNewRequests] = useState(0)
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const pageTitle = useMemo(() => {
    const exact = routeTitles[location.pathname]
    if (exact) return exact
    if (location.pathname.startsWith('/admin/produits/')) return 'Fiche produit'
    if (location.pathname.startsWith('/admin/visual-identity')) return 'Studio visuel'
    return 'Espace propriétaire'
  }, [location.pathname])

  useEffect(() => {
    try { window.localStorage.setItem('lunder-admin-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded') }
    catch { /* Storage may be unavailable; navigation still works. */ }
  }, [sidebarCollapsed])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const { count } = await supabase
        .from('custom_requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['new', 'reviewing'])
        .is('deletion_started_at', null)
      if (active) setNewRequests(count ?? 0)
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Keep the document itself from scrolling: the admin content and sidebar
  // already own their scroll areas, so the browser-level scrollbar is redundant.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'

    return () => {
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
    }
  }, [])

  const handleSignOut = async () => {
    await supabase.rpc('log_owner_event', { p_action: 'proprietaire.deconnexion' })
    await signOut()
    navigate('/admin')
  }

  return (
    <AdminConfirmProvider>
      <AdminNotificationsProvider ownerId={profile?.id ?? null} navigate={navigate}>
        <div className="admin-shell flex h-screen overflow-hidden bg-charcoal-950">
          {sidebarOpen && (
            <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          <aside className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col overflow-hidden border-r border-white/[0.07] bg-[#111318] shadow-2xl transition-[width,transform] duration-300 md:relative md:translate-x-0 ${sidebarCollapsed ? 'md:w-[5rem]' : 'md:w-[17rem]'} w-[17rem] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex h-[4.5rem] shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
              <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-red shadow-lg shadow-brand-red/20"><Printer className="h-5 w-5 text-white" /></span>
                <span className={`min-w-0 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                  <span className="block truncate text-sm font-black tracking-[0.12em] text-white">LUNDER</span>
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-charcoal-500">Studio de gestion</span>
                </span>
              </Link>
              <button type="button" className="rounded-lg p-2 text-charcoal-400 hover:bg-white/5 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fermer"><X className="h-5 w-5" /></button>
              <button type="button" className="hidden rounded-lg p-2 text-charcoal-400 transition hover:bg-white/5 hover:text-white md:inline-flex" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Développer la navigation' : 'Réduire la navigation'} title={sidebarCollapsed ? 'Développer' : 'Réduire'}>
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>

            <nav aria-label="Navigation administrative" className="min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-5 scrollbar-thin">
              {navGroups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h2 className={`mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-charcoal-500 ${sidebarCollapsed ? 'md:sr-only' : ''}`}>{group.label}</h2>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavLink key={item.to} to={item.to} title={sidebarCollapsed ? item.label : undefined} aria-label={sidebarCollapsed ? item.label : undefined} className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''} ${isActive ? 'bg-brand-red/10 text-white ring-1 ring-inset ring-brand-red/20' : 'text-charcoal-400 hover:bg-white/[0.045] hover:text-white'}`}>
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-brand-red" />}
                            <item.icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? 'text-brand-red-light' : 'text-charcoal-500 group-hover:text-charcoal-200'}`} />
                            <span className={`min-w-0 flex-1 truncate ${sidebarCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                            {item.badge && newRequests > 0 && <span className={`rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-bold text-white ${sidebarCollapsed ? 'md:absolute md:-right-1 md:-top-1 md:px-1.5' : ''}`}>{newRequests > 99 ? '99+' : newRequests}</span>}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </section>
              ))}
            </nav>

            <div className="shrink-0 border-t border-white/[0.07] p-3">
              <div className={`mb-2 flex items-center gap-3 rounded-xl bg-white/[0.035] p-3 ${sidebarCollapsed ? 'md:justify-center md:px-1' : ''}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-charcoal-700 text-[11px] font-bold text-charcoal-200">LD</span>
                <span className={`min-w-0 flex-1 ${sidebarCollapsed ? 'md:hidden' : ''}`}><span className="block truncate text-xs font-semibold text-white">Propriétaire</span><span className="block truncate text-[10px] text-charcoal-500">{'Compte administrateur'}</span></span>
              </div>
              <button onClick={handleSignOut} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-charcoal-400 transition hover:bg-red-500/10 hover:text-red-300 ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''}`} title={sidebarCollapsed ? 'Déconnexion' : undefined}>
                <LogOut className="h-4 w-4" /><span className={sidebarCollapsed ? 'md:hidden' : ''}>Déconnexion</span>
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="z-20 flex h-[4.5rem] shrink-0 items-center justify-between border-b border-white/[0.07] bg-charcoal-950/95 px-4 backdrop-blur-xl md:px-7">
              <div className="flex min-w-0 items-center gap-3">
                <button className="rounded-xl border border-white/10 p-2 text-charcoal-200 hover:bg-white/5 md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
                <div className="min-w-0">
                  <div className="hidden items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal-500 sm:flex"><span>LUNDER</span><ChevronRight className="h-3 w-3" /><span>Administration</span></div>
                  <h1 className="truncate text-sm font-bold text-white md:text-base">{pageTitle}</h1>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <Link
                  to="/boutique"
                  className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-charcoal-300 transition hover:border-brand-red/40 hover:text-white lg:inline-flex"
                >
                  <Store className="h-3.5 w-3.5" /> Voir la boutique
                </Link>
                <Link to="/admin/produits/nouveau" className="btn-primary hidden sm:inline-flex">
                  <Plus className="h-4 w-4" /> Nouveau produit
                </Link>
                <span className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-[10px] font-semibold text-emerald-300 xl:inline-flex">Espace sécurisé</span>
                <NotificationCenter />
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin bg-[radial-gradient(ellipse_at_top_left,rgba(190,35,52,0.055),transparent_38%)] p-4 md:p-7 xl:p-8">
              <div className="mx-auto w-full max-w-[1600px] space-y-5">
                {ATELIER_ROUTES.includes(location.pathname) && <AtelierTabs />}
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </AdminNotificationsProvider>
    </AdminConfirmProvider>
  )
}
