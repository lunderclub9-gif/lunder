import { useEffect, useState } from 'react'
import { History as HistoryIcon, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type AuditEntry = {
  id: number
  action: string
  entity: string
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  'products.insert': 'Produit créé',
  'products.update': 'Produit modifié',
  'products.delete': 'Produit supprimé',
  'delivery_rates.insert': 'Tarif de livraison ajouté',
  'delivery_rates.update': 'Tarif de livraison modifié',
  'delivery_rates.delete': 'Tarif de livraison supprimé',
  'store_settings.insert': 'Paramètre créé',
  'store_settings.update': 'Paramètre modifié',
  'custom_quotes.insert': 'Devis émis',
  'custom_quotes.update': 'Devis mis à jour',
  'orders.update': 'Commande modifiée',
  'proprietaire.connexion': 'Connexion propriétaire',
  'proprietaire.deconnexion': 'Déconnexion propriétaire',
}

function summarize(details: Record<string, unknown> | null): string {
  if (!details) return ''
  const keys = Object.keys(details).filter((key) => key !== 'supprime' && key !== 'cree')
  if (keys.length === 0) return details.supprime ? 'Suppression' : details.cree ? 'Création' : ''
  return keys
    .map((key) => {
      const change = details[key]
      if (change && typeof change === 'object' && 'avant' in change && 'apres' in change) {
        const before = (change as { avant: unknown }).avant
        const after = (change as { apres: unknown }).apres
        return `${key}: ${String(before ?? '—')} → ${String(after ?? '—')}`
      }
      return key
    })
    .join(' · ')
}

export default function AdminHistory() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('id, action, entity, entity_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setEntries((data as AuditEntry[]) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="animate-fade-in">
      <h1 className="mb-2 text-2xl font-bold text-offwhite">Historique</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Journal en append-only des actions du propriétaire : produits, tarifs, paramètres, devis et
        commandes. Les 200 dernières entrées sont affichées.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
        </div>
      ) : entries.length === 0 ? (
        <div className="admin-card py-16 text-center">
          <HistoryIcon className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">Aucune action enregistrée pour le moment.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="admin-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-offwhite">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                <span className="text-xs text-charcoal-400">
                  {new Date(entry.created_at).toLocaleString('fr-DZ')}
                </span>
              </div>
              <p className="mt-1 break-words text-xs text-charcoal-400">
                {entry.entity}
                {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ''}
                {summarize(entry.details) ? ` — ${summarize(entry.details)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
