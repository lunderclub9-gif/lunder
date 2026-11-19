import { NavLink } from 'react-router-dom'
import { Calculator, Coins, FileSpreadsheet, SlidersHorizontal } from 'lucide-react'

const TABS = [
  { to: '/admin/couts-produits', label: 'Matières premières', icon: Coins },
  { to: '/admin/tarification', label: 'Règles de fabrication', icon: SlidersHorizontal },
  { to: '/admin/analyse-fichiers', label: 'Analyse de fichiers', icon: FileSpreadsheet },
  { to: '/admin/calcul-devis', label: 'Calculateur de devis', icon: Calculator },
]

/**
 * Les quatre outils de l'atelier forment une chaîne : les matières donnent les
 * coûts, les règles donnent les prix, l'analyse lit les fichiers et le
 * calculateur produit le devis. Les onglets rendent cette chaîne visible sans
 * changer les URL existantes (favoris et liens profonds préservés).
 */
export default function AtelierTabs() {
  return (
    <nav aria-label="Outils de l’atelier" className="rounded-xl border border-white/[0.075] bg-white/[0.02] p-1.5">
      <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
        <ul className="flex min-w-0 gap-1 overflow-x-auto scrollbar-thin">
          {TABS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-semibold transition ${
                    isActive
                      ? 'bg-brand-red/10 text-white ring-1 ring-inset ring-brand-red/20'
                      : 'text-charcoal-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="hidden shrink-0 px-2 text-[10px] leading-4 text-charcoal-500 lg:block">
          Matières → coûts → règles → devis
        </p>
      </div>
    </nav>
  )
}
