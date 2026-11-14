import { useCallback, useEffect, useState } from 'react'
import { Bell, Loader2, Plus, Printer, Save, Trash2, Volume2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import {
  canUseBrowserNotifications,
  playAdminNotificationSound,
  readAdminPreferences,
  requestBrowserNotificationPermission,
  writeAdminPreferences,
  type AdminPreferences,
} from '@/lib/admin-preferences'

type Setting = { key: string; value: string | null; is_public: boolean }
type Material = { id: string; name: string; cost_per_kg_dzd: number; is_active: boolean }

const GROUPS: { title: string; keys: { key: string; label: string; type: 'text' | 'tel' | 'email' | 'url' | 'textarea'; help?: string }[] }[] = [
  {
    title: 'Contact',
    keys: [
      { key: 'phone', label: 'Téléphone', type: 'tel', help: 'Format algérien, ex. 0550 12 34 56' },
      { key: 'whatsapp', label: 'WhatsApp', type: 'tel' },
      { key: 'email', label: 'Email professionnel', type: 'email' },
      { key: 'address', label: 'Adresse du studio', type: 'text' },
    ],
  },
  {
    title: 'Réseaux sociaux',
    keys: [
      { key: 'instagram_url', label: 'Instagram (URL complète)', type: 'url' },
      { key: 'facebook_url', label: 'Facebook (URL complète)', type: 'url' },
      { key: 'tiktok_url', label: 'TikTok (URL complète)', type: 'url' },
    ],
  },
  {
    title: 'Référencement',
    keys: [
      { key: 'seo_title', label: 'Titre SEO', type: 'text' },
      { key: 'seo_description', label: 'Description SEO', type: 'textarea' },
    ],
  },
  {
    title: 'Politiques et conditions',
    keys: [
      { key: 'policy_returns', label: 'Retours et échanges', type: 'textarea', help: 'Texte validé par vous uniquement.' },
      { key: 'policy_privacy', label: 'Confidentialité', type: 'textarea' },
      { key: 'policy_terms', label: 'Conditions de vente', type: 'textarea' },
    ],
  },
]

export default function AdminSettings() {
  const { profile } = useAuth()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [preferences, setPreferences] = useState<AdminPreferences>(() => readAdminPreferences(profile?.id ?? null))
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null)

  const [materials, setMaterials] = useState<Material[]>([])
  const [materialName, setMaterialName] = useState('')
  const [materialCost, setMaterialCost] = useState('')

  const load = useCallback(async () => {
    const [{ data: settings }, { data: mats }] = await Promise.all([
      supabase.from('store_settings').select('key, value, is_public').order('key'),
      supabase.from('materials').select('id, name, cost_per_kg_dzd, is_active').order('name'),
    ])
    const next: Record<string, string> = {}
    ;((settings as Setting[]) ?? []).forEach((row) => {
      next[row.key] = row.value ?? ''
    })
    setValues(next)
    setMaterials((mats as Material[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPreferences(readAdminPreferences(profile?.id ?? null))
  }, [profile?.id])

  const updatePreference = <Key extends keyof AdminPreferences,>(key: Key, value: AdminPreferences[Key]) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value }
      if (profile?.id) writeAdminPreferences(profile.id, next)
      return next
    })
  }

  const toggleBrowserNotifications = async () => {
    setPreferenceMessage(null)
    if (preferences.browserNotifications) {
      updatePreference('browserNotifications', false)
      setPreferenceMessage('Les notifications du navigateur sont désactivées.')
      return
    }
    if (!canUseBrowserNotifications()) {
      setPreferenceMessage('Ce navigateur ne prend pas en charge les notifications système.')
      return
    }
    if (window.Notification.permission === 'granted') {
      updatePreference('browserNotifications', true)
      setPreferenceMessage('Les notifications du navigateur sont activées pendant que l’application est ouverte.')
      return
    }
    if (window.Notification.permission === 'denied') {
      setPreferenceMessage('Le navigateur a bloqué les notifications. Autorisez-les dans les paramètres du site, puis réessayez.')
      return
    }
    if (preferences.browserPermissionPrompted) {
      setPreferenceMessage('La demande a déjà été présentée. Modifiez l’autorisation dans les paramètres du navigateur pour l’activer.')
      return
    }
    let permission: NotificationPermission | 'unsupported'
    try {
      permission = await requestBrowserNotificationPermission()
    } catch {
      updatePreference('browserPermissionPrompted', true)
      setPreferenceMessage('Le navigateur n’a pas pu présenter la demande. Vérifiez ses paramètres de site pour activer les notifications.')
      return
    }
    updatePreference('browserPermissionPrompted', true)
    if (permission === 'granted') {
      updatePreference('browserNotifications', true)
      setPreferenceMessage('Les notifications du navigateur sont activées pendant que l’application est ouverte.')
    } else if (permission === 'denied') {
      setPreferenceMessage('Autorisation refusée. Vous pourrez la modifier dans les paramètres du navigateur.')
    } else {
      setPreferenceMessage('Aucune autorisation n’a été accordée. La demande ne sera pas répétée automatiquement.')
    }
  }

  const testSound = () => {
    setPreferenceMessage(
      playAdminNotificationSound()
        ? 'Son de test joué.'
        : 'Le son n’a pas pu être joué par ce navigateur. Vérifiez ses réglages audio.'
    )
  }

  const save = async () => {
    setError(null)
    setSaved(false)

    const invalid = GROUPS.flatMap((group) => group.keys).find((field) => {
      if (field.type !== 'url') return false
      const value = values[field.key]?.trim()
      return value ? !/^https:\/\/[\w.-]+\.[a-z]{2,}\//i.test(value) : false
    })
    if (invalid) {
      setError(`Le lien ${invalid.label} doit être une URL complète en https://`)
      return
    }

    setSaving(true)
    const rows = Object.entries(values).map(([key, value]) => ({
      key,
      value: value.trim() ? value.trim() : null,
    }))
    const { error: writeError } = await supabase
      .from('store_settings')
      .upsert(rows, { onConflict: 'key' })
    setSaving(false)

    if (writeError) {
      setError("Impossible d'enregistrer les paramètres.")
      return
    }
    setSaved(true)
  }

  const addMaterial = async () => {
    setError(null)
    const cost = Number(materialCost)
    if (!materialName.trim() || !Number.isFinite(cost) || cost < 0) {
      setError('Renseignez un nom de matière et un coût au kilo valide.')
      return
    }
    const { error: insertError } = await supabase.from('materials').insert({
      name: materialName.trim(),
      cost_per_kg_dzd: Math.round(cost),
    })
    if (insertError) {
      setError('Impossible d’ajouter cette matière (nom déjà utilisé ?).')
      return
    }
    setMaterialName('')
    setMaterialCost('')
    await load()
  }

  const updateMaterialCost = async (material: Material, cost: string) => {
    const parsed = Number(cost)
    if (!Number.isFinite(parsed) || parsed < 0) return
    const { error: updateError } = await supabase
      .from('materials')
      .update({ cost_per_kg_dzd: Math.round(parsed) })
      .eq('id', material.id)
    if (updateError) {
      setError('Impossible de mettre à jour ce coût.')
      return
    }
    await load()
  }

  const deleteMaterial = async (id: string) => {
    if (!confirm('Supprimer cette matière ? Les fiches de coût associées perdront leur matière.')) return
    const { error: deleteError } = await supabase.from('materials').delete().eq('id', id)
    if (deleteError) {
      setError('Impossible de supprimer cette matière.')
      return
    }
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-2 text-2xl font-bold text-offwhite">Paramètres</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Ces informations sont publiques et affichées sur la boutique lorsqu'elles sont renseignées.
        Les liens vides sont masqués. Les clés d'API et secrets ne doivent jamais être saisis ici :
        utilisez les secrets de votre hébergeur.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-400">
          Paramètres enregistrés.
        </div>
      )}

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group.title} className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">{group.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {group.keys.map((field) => (
                <label
                  key={field.key}
                  className={`block ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
                >
                  <span className="label-text">{field.label}</span>
                  {field.type === 'textarea' ? (
                    <textarea
                      rows={field.key.startsWith('policy_') ? 5 : 3}
                      value={values[field.key] ?? ''}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                      className="input-field resize-none"
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={values[field.key] ?? ''}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                      className="input-field"
                      placeholder={field.help ?? ''}
                    />
                  )}
                  {field.help && <span className="mt-1 block text-xs text-charcoal-500">{field.help}</span>}
                </label>
              ))}
            </div>
          </section>
        ))}

        <section className="admin-card">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-red-light" />
            <h2 className="text-lg font-semibold text-offwhite">Notifications du propriétaire</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-charcoal-400">
            Les préférences sont conservées sur ce navigateur et cet appareil. Les événements de commande et de demande sont enregistrés côté base de données.
          </p>
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-charcoal-400/15 p-3">
              <span>
                <span className="block text-sm font-medium text-offwhite">Notifications internes</span>
                <span className="block text-xs text-charcoal-400">Centre et compteur dans l’en-tête admin</span>
              </span>
              <input type="checkbox" checked={preferences.inAppNotifications} onChange={(event) => updatePreference('inAppNotifications', event.target.checked)} className="h-4 w-4 accent-brand-red" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-charcoal-400/15 p-3">
              <span>
                <span className="block text-sm font-medium text-offwhite">Nouvelles commandes</span>
                <span className="block text-xs text-charcoal-400">Inclure les commandes non lues dans les alertes</span>
              </span>
              <input type="checkbox" checked={preferences.notifyOrders} onChange={(event) => updatePreference('notifyOrders', event.target.checked)} className="h-4 w-4 accent-brand-red" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-charcoal-400/15 p-3">
              <span>
                <span className="block text-sm font-medium text-offwhite">Demandes sur mesure</span>
                <span className="block text-xs text-charcoal-400">Inclure les nouvelles demandes dans les alertes</span>
              </span>
              <input type="checkbox" checked={preferences.notifyCustomRequests} onChange={(event) => updatePreference('notifyCustomRequests', event.target.checked)} className="h-4 w-4 accent-brand-red" />
            </label>
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-charcoal-400/15 p-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-offwhite">Notifications du navigateur</p>
                <p className="mt-1 text-xs text-charcoal-400">Uniquement lorsque l’application est ouverte; pas d’envoi après fermeture complète du navigateur.</p>
              </div>
              <button type="button" onClick={() => void toggleBrowserNotifications()} className="btn-secondary flex-shrink-0 px-3 py-2 text-xs">
                {preferences.browserNotifications ? 'Désactiver' : 'Activer'}
              </button>
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-charcoal-400/15 p-3 sm:flex-row sm:items-center">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-offwhite"><Volume2 className="h-4 w-4" /> Son des alertes</p>
                <p className="mt-1 text-xs text-charcoal-400">Un signal bref par nouvel événement reçu pendant que cette page est ouverte.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => updatePreference('soundNotifications', !preferences.soundNotifications)} className="btn-secondary px-3 py-2 text-xs">
                  {preferences.soundNotifications ? 'Désactiver' : 'Activer'}
                </button>
                <button type="button" onClick={testSound} className="btn-ghost px-3 py-2 text-xs">Tester</button>
              </div>
            </div>
          </div>
          {preferenceMessage && <p role="status" className="mt-3 text-xs text-charcoal-200">{preferenceMessage}</p>}
        </section>

        <section className="admin-card">
          <div className="mb-2 flex items-center gap-2">
            <Printer className="h-5 w-5 text-brand-red-light" />
            <h2 className="text-lg font-semibold text-offwhite">Impression des commandes</h2>
          </div>
          <p className="mb-4 text-xs text-charcoal-400">Les préférences sont locales à ce navigateur. Un aperçu de la commande est toujours affiché avant l’ouverture de la boîte d’impression.</p>
          <fieldset>
            <legend className="label-text">Format par défaut</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-charcoal-200">
                <input type="radio" name="default-print-format" checked={preferences.defaultPrintFormat === 'a4'} onChange={() => updatePreference('defaultPrintFormat', 'a4')} className="accent-brand-red" />
                A4
              </label>
              <label className="flex items-center gap-2 text-sm text-charcoal-200">
                <input type="radio" name="default-print-format" checked={preferences.defaultPrintFormat === 'thermal'} onChange={() => updatePreference('defaultPrintFormat', 'thermal')} className="accent-brand-red" />
                Thermique
              </label>
            </div>
          </fieldset>
          <fieldset className="mt-4" disabled={preferences.defaultPrintFormat !== 'thermal'}>
            <legend className="label-text">Largeur thermique par défaut</legend>
            <div className="flex flex-wrap gap-4">
              {([58, 80] as const).map((width) => (
                <label key={width} className={`flex items-center gap-2 text-sm ${preferences.defaultPrintFormat === 'thermal' ? 'text-charcoal-200' : 'text-charcoal-500'}`}>
                  <input type="radio" name="default-thermal-width" checked={preferences.thermalWidth === width} onChange={() => updatePreference('thermalWidth', width)} className="accent-brand-red" />
                  {width} mm
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="admin-card">
          <h2 className="mb-1 text-lg font-semibold text-offwhite">Matières et coûts</h2>
          <p className="mb-4 text-xs text-charcoal-400">
            Coût d'achat réel au kilogramme. Ces valeurs alimentent l'estimation de coût de chaque
            produit ; elles ne sont jamais visibles par les clients.
          </p>

          {materials.length === 0 ? (
            <p className="mb-4 text-sm text-charcoal-400">Aucune matière enregistrée.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {materials.map((material) => (
                <li
                  key={material.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-charcoal-400/15 px-3 py-2"
                >
                  <span className="text-sm text-offwhite">{material.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      defaultValue={material.cost_per_kg_dzd}
                      onBlur={(event) => updateMaterialCost(material, event.target.value)}
                      className="input-field w-28 py-1.5 text-sm"
                      aria-label={`Coût au kilo de ${material.name}`}
                    />
                    <span className="text-xs text-charcoal-400">DA / kg</span>
                    <button
                      type="button"
                      onClick={() => deleteMaterial(material.id)}
                      className="text-charcoal-400 hover:text-brand-red"
                      aria-label={`Supprimer ${material.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={materialName}
              onChange={(event) => setMaterialName(event.target.value)}
              className="input-field"
              placeholder="Nom (ex: PLA noir)"
            />
            <input
              type="number"
              min={0}
              value={materialCost}
              onChange={(event) => setMaterialCost(event.target.value)}
              className="input-field sm:w-40"
              placeholder="DA / kg"
            />
            <button type="button" onClick={addMaterial} className="btn-secondary">
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          </div>
          {materials.length > 0 && (
            <p className="mt-3 text-xs text-charcoal-500">
              Exemple : {materials[0].name} à {formatDzd(materials[0].cost_per_kg_dzd)} le kilo.
            </p>
          )}
        </section>

        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer les paramètres
        </button>
      </div>
    </div>
  )
}
