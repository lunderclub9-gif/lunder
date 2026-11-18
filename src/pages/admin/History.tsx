import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { History as HistoryIcon, Loader2, RefreshCw, Search, AlertTriangle } from 'lucide-react'
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
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const requestSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current
    setLoading(true)
    const pageSize = 500
    const allEntries: AuditEntry[] = []
    let offset = 0
    let queryError: Error | null = null

    while (true) {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, action, entity, entity_id, details, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (sequence !== requestSequence.current) return
      if (error) {
        queryError = error
        break
      }
      const batch = (data as AuditEntry[]) ?? []
      allEntries.push(...batch)
      if (batch.length < pageSize) break
      offset += pageSize
    }

    if (sequence !== requestSequence.current) return
    if (queryError) {
      setError('Impossible de charger le journal complet. Vérifiez votre connexion et vos droits.')
    } else {
      setError(null)
      setEntries(allEntries)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term) return entries
    return entries.filter((entry) => [
      ACTION_LABELS[entry.action] ?? entry.action,
      entry.action,
      entry.entity,
      entry.entity_id ?? '',
      summarize(entry.details),
    ].some((value) => value.toLocaleLowerCase().includes(term)))
  }, [entries, search])

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="admin-eyebrow">Traçabilité & sécurité</p><h1 className="text-2xl font-bold text-offwhite">Historique</h1>
          <p className="mt-2 text-sm text-charcoal-400">Journal complet des actions du propriétaire, chargé par lots pour préserver la consultation des anciennes opérations.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser</button>
      </div>

      {error && <div role="alert" className="admin-feedback admin-feedback-error mb-4"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
      <label className="relative mb-5 block max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-500" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10" placeholder="Rechercher une action, une table ou un identifiant…" aria-label="Rechercher dans l'historique" />
      </label>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="admin-card py-16 text-center">
          <HistoryIcon className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">{search.trim() ? 'Aucune action ne correspond à cette recherche.' : 'Aucune action enregistrée pour le moment.'}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredEntries.map((entry) => (
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
      <p className="mt-4 text-xs text-charcoal-500">{filteredEntries.length} entrée(s) affichée(s) sur {entries.length} chargée(s).</p>
    </div>
  )
}
