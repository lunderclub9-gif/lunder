import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Printer, LayoutDashboard, Package, Tag, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'

const navItems = [
  { to: '/admin/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/admin/produits', label: 'Produits', icon: Package },
  { to: '/admin/categories', label: 'Catégories', icon: Tag },
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-charcoal-950">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-charcoal-400/10 bg-charcoal-900 transition-transform md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-charcoal-400/10 px-4">
          <Link to="/admin/dashboard" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red">
              <Printer className="h-4 w-4 text-white" />
            </div>
            <span className="text-xs font-bold tracking-wide text-offwhite">LUNDER'S 3D</span>
          </Link>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fermer">
            <X className="h-5 w-5 text-charcoal-300" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-red/10 text-brand-red' : 'text-charcoal-300 hover:bg-charcoal-800 hover:text-offwhite'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-charcoal-400/10 p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-charcoal-300 transition-colors hover:bg-charcoal-800 hover:text-offwhite"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-charcoal-400/10 bg-charcoal-900 px-4 md:px-6">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <Menu className="h-6 w-6 text-charcoal-200" />
          </button>
          <span className="text-sm text-charcoal-400">Espace propriétaire</span>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
