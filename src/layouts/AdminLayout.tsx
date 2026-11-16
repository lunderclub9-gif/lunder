import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Printer, LayoutDashboard, Package, Tag, LogOut, Menu, X,
  ShoppingBag, Truck, ClipboardList, Settings, History, Calculator, Coins, BarChart3, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { AdminNotificationsProvider } from '@/components/admin/AdminNotificationsProvider'
import NotificationCenter from '@/components/admin/NotificationCenter'
import { AdminConfirmProvider } from '@/components/admin/AdminConfirmProvider'

const navGroups = [
  { label: 'Vue d’ensemble', items: [{ to: '/admin/dashboard', label: 'Tableau de bord', icon: LayoutDashboard }] },
  { label: 'Ventes et opérations', items: [
    { to: '/admin/commandes', label: 'Commandes', icon: ShoppingBag },
    { to: '/admin/livraison', label: 'Livraison', icon: Truck },
    { to: '/admin/demandes', label: 'Demandes sur mesure', icon: ClipboardList },
  ] },
  { label: 'Catalogue', items: [
    { to: '/admin/produits', label: 'Produits', icon: Package },
    { to: '/admin/categories', label: 'Catégories', icon: Tag },
  ] },
  { label: 'Tarification', items: [
    { to: '/admin/couts-produits', label: 'Matières premières', icon: Coins },
    { to: '/admin/tarification', label: 'Fabrication sur mesure', icon: Calculator },
  ] },
  { label: 'Finances', items: [{ to: '/admin/finances', label: 'Centre financier', icon: BarChart3 }] },
  { label: 'Configuration', items: [{ to: '/admin/parametres', label: 'Paramètres du magasin', icon: Settings }] },
  { label: 'Suivi', items: [{ to: '/admin/historique', label: 'Historique', icon: History }] },
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [newRequests, setNewRequests] = useState(0)
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const { count } = await supabase
        .from('custom_requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['new', 'reviewing'])
        .not('estimate_accepted_at', 'is', null)
      if (active) setNewRequests(count ?? 0)
    }
    refresh()
    const timer = setInterval(refresh, 60000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
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
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col transform overflow-hidden border-r border-charcoal-400/10 bg-charcoal-900 transition-all duration-200 md:relative md:translate-x-0 ${sidebarCollapsed ? 'md:w-[4.75rem]' : 'md:w-64'} ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-charcoal-400/10 px-4">
          <Link to="/admin/dashboard" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red">
              <Printer className="h-4 w-4 text-white" />
            </div>
            <span className={`text-xs font-bold tracking-wide text-offwhite ${sidebarCollapsed ? "md:hidden" : ""}`}>LUNDER'S 3D</span>
          </Link>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fermer">
            <X className="h-5 w-5 text-charcoal-300" />
          </button>
          <button
            type="button"
            className="hidden rounded-lg p-2 text-charcoal-300 transition-colors hover:bg-charcoal-800 hover:text-offwhite md:inline-flex"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Développer la navigation" : "Réduire la navigation"}
            title={sidebarCollapsed ? "Développer la navigation" : "Réduire la navigation"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav aria-label="Navigation administrative" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 pb-4 scrollbar-thin">
          {navGroups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-charcoal-500 ${sidebarCollapsed ? "md:sr-only" : ""}`}>{group.label}</h2>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)} title={sidebarCollapsed ? item.label : undefined} aria-label={sidebarCollapsed ? item.label : undefined} className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${sidebarCollapsed ? "md:justify-center md:px-2 md:relative" : ""} ${
                      isActive ? 'bg-brand-red/10 text-brand-red' : 'text-charcoal-300 hover:bg-charcoal-800 hover:text-offwhite'
                    }`
                  }>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className={sidebarCollapsed ? "md:hidden" : ""}>{item.label}</span>
                    {item.to === '/admin/demandes' && newRequests > 0 && <span className={`ml-auto rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-bold text-white ${sidebarCollapsed ? "md:absolute md:right-1 md:top-1" : ""}`}>{newRequests}</span>}
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="shrink-0 border-t border-charcoal-400/10 bg-charcoal-900 p-3">
          <button
            onClick={handleSignOut}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-charcoal-300 transition-colors hover:bg-charcoal-800 hover:text-offwhite ${sidebarCollapsed ? "md:justify-center md:px-2" : ""}`} title={sidebarCollapsed ? "Déconnexion" : undefined}
          >
            <LogOut className="h-4 w-4" />
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Déconnexion</span>
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-charcoal-400/10 bg-charcoal-900 px-4 md:px-6">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <Menu className="h-6 w-6 text-charcoal-200" />
          </button>
          <span className="text-sm text-charcoal-400">Espace propriétaire</span>
          <NotificationCenter />
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </AdminNotificationsProvider>
    </AdminConfirmProvider>
  )
}
