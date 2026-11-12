import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { orderErrorMessage, type DeliveryQuote } from '@/lib/checkout'

type Wilaya = { code: number; name_fr: string; is_active: boolean }
type Commune = { id: string; name_fr: string }
type Rate = {
  id: string
  wilaya_code: number
  commune_id: string | null
  method: 'domicile' | 'stopdesk'
  price_dzd: number
  carrier: string | null
  estimated_days_min: number | null
  estimated_days_max: number | null
  is_active: boolean
}
type PickupPoint = { id: string; name: string; address: string | null; commune_id: string | null; is_active: boolean }

const emptyRate = {
  method: 'domicile' as 'domicile' | 'stopdesk',
  scope: 'wilaya' as 'wilaya' | 'commune',
  commune_id: '',
  price_dzd: '',
  carrier: '',
  days_min: '',
  days_max: '',
  is_active: true,
}

export default function AdminDelivery() {
  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [wilayaCode, setWilayaCode] = useState('')
  const [communes, setCommunes] = useState<Commune[]>([])
  const [rates, setRates] = useState<Rate[]>([])
  const [points, setPoints] = useState<PickupPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ ...emptyRate })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pointName, setPointName] = useState('')
  const [pointAddress, setPointAddress] = useState('')
  const [pointCommune, setPointCommune] = useState('')

  const [previewCommune, setPreviewCommune] = useState('')
  const [previewMethod, setPreviewMethod] = useState<'domicile' | 'stopdesk'>('domicile')
  const [preview, setPreview] = useState<DeliveryQuote | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('wilayas')
      .select('code, name_fr, is_active')
      .order('code')
      .then(({ data }) => {
        const list = (data as Wilaya[]) ?? []
        setWilayas(list)
        setWilayaCode((current) => current || String(list[0]?.code ?? ''))
        setLoading(false)
      })
  }, [])

  const loadRates = useCallback(async (code: number) => {
    const { data } = await supabase
      .from('delivery_rates')
      .select('*')
      .eq('wilaya_code', code)
      .order('method')
    setRates((data as Rate[]) ?? [])
  }, [])

  const loadPoints = useCallback(async (code: number) => {
    const { data } = await supabase
      .from('pickup_points')
      .select('*')
      .eq('wilaya_code', code)
      .order('name')
    setPoints((data as PickupPoint[]) ?? [])
  }, [])

  useEffect(() => {
    setPreview(null)
    setPreviewError(null)
    setPreviewCommune('')
    if (!wilayaCode) return
    const code = Number(wilayaCode)
    supabase
      .from('communes')
      .select('id, name_fr')
      .eq('wilaya_code', code)
      .eq('is_active', true)
      .order('name_fr')
      .then(({ data }) => setCommunes((data as Commune[]) ?? []))
    loadRates(code)
    loadPoints(code)
  }, [wilayaCode, loadRates, loadPoints])

  const resetForm = () => {
    setForm({ ...emptyRate })
    setEditingId(null)
  }

  const saveRate = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const price = Number(form.price_dzd)
    if (!Number.isFinite(price) || price < 0) {
      setError('Le prix doit être un nombre entier de dinars positif.')
      return
    }
    if (form.scope === 'commune' && !form.commune_id) {
      setError('Sélectionnez la commune concernée.')
      return
    }

    setSaving(true)
    const payload = {
      wilaya_code: Number(wilayaCode),
      commune_id: form.scope === 'commune' ? form.commune_id : null,
      method: form.method,
      price_dzd: Math.round(price),
      carrier: form.carrier.trim() || null,
      estimated_days_min: form.days_min ? Number(form.days_min) : null,
      estimated_days_max: form.days_max ? Number(form.days_max) : null,
      is_active: form.is_active,
    }

    const { error: writeError } = editingId
      ? await supabase.from('delivery_rates').update(payload).eq('id', editingId)
      : await supabase.from('delivery_rates').insert(payload)

    setSaving(false)
    if (writeError) {
      setError(
        writeError.code === '23505'
          ? 'Un tarif actif existe déjà pour ce mode et cette destination.'
          : "Impossible d'enregistrer ce tarif."
      )
      return
    }
    resetForm()
    await loadRates(Number(wilayaCode))
  }

  const editRate = (rate: Rate) => {
    setEditingId(rate.id)
    setForm({
      method: rate.method,
      scope: rate.commune_id ? 'commune' : 'wilaya',
      commune_id: rate.commune_id ?? '',
      price_dzd: String(rate.price_dzd),
      carrier: rate.carrier ?? '',
      days_min: rate.estimated_days_min != null ? String(rate.estimated_days_min) : '',
      days_max: rate.estimated_days_max != null ? String(rate.estimated_days_max) : '',
      is_active: rate.is_active,
    })
  }

  const deleteRate = async (id: string) => {
    if (!confirm('Supprimer ce tarif de livraison ?')) return
    const { error: deleteError } = await supabase.from('delivery_rates').delete().eq('id', id)
    if (deleteError) {
      setError('Impossible de supprimer ce tarif.')
      return
    }
    await loadRates(Number(wilayaCode))
  }

  const toggleWilaya = async (wilaya: Wilaya) => {
    const { error: updateError } = await supabase
      .from('wilayas')
      .update({ is_active: !wilaya.is_active })
      .eq('code', wilaya.code)
    if (updateError) {
      setError('Impossible de modifier cette wilaya.')
      return
    }
    setWilayas((current) =>
      current.map((item) => (item.code === wilaya.code ? { ...item, is_active: !item.is_active } : item))
    )
  }

  const addPoint = async () => {
    if (!pointName.trim()) return
    setError(null)
    const { error: insertError } = await supabase.from('pickup_points').insert({
      wilaya_code: Number(wilayaCode),
      commune_id: pointCommune || null,
      name: pointName.trim(),
      address: pointAddress.trim() || null,
    })
    if (insertError) {
      setError("Impossible d'ajouter ce point relais.")
      return
    }
    setPointName('')
    setPointAddress('')
    setPointCommune('')
    await loadPoints(Number(wilayaCode))
  }

  const deletePoint = async (id: string) => {
    const { error: deleteError } = await supabase.from('pickup_points').delete().eq('id', id)
    if (deleteError) {
      setError('Impossible de supprimer ce point relais.')
      return
    }
    await loadPoints(Number(wilayaCode))
  }

  const runPreview = async () => {
    setPreview(null)
    setPreviewError(null)
    const { data, error: rpcError } = await supabase.rpc('quote_delivery', {
      p_wilaya_code: Number(wilayaCode),
      p_commune_id: previewCommune || null,
      p_method: previewMethod,
    })
    const row = Array.isArray(data) ? (data[0] as DeliveryQuote | undefined) : undefined
    if (rpcError || !row) {
      setPreviewError(
        orderErrorMessage(rpcError?.message, 'Aucun tarif actif : la livraison sera indisponible.')
      )
      return
    }
    setPreview(row)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
      </div>
    )
  }

  const currentWilaya = wilayas.find((wilaya) => String(wilaya.code) === wilayaCode)

  return (
    <div className="animate-fade-in">
      <h1 className="mb-2 text-2xl font-bold text-offwhite">Livraison</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Les tarifs et points relais ci-dessous sont les seules sources utilisées au moment de la
        commande. Sans tarif actif, la livraison est indisponible — elle n'est jamais gratuite par
        défaut.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label-text">Wilaya</span>
          <select value={wilayaCode} onChange={(event) => setWilayaCode(event.target.value)} className="input-field">
            {wilayas.map((wilaya) => (
              <option key={wilaya.code} value={wilaya.code}>
                {String(wilaya.code).padStart(2, '0')} — {wilaya.name_fr}
                {wilaya.is_active ? '' : ' (désactivée)'}
              </option>
            ))}
          </select>
        </label>

        {currentWilaya && (
          <div className="flex items-end">
            <button type="button" onClick={() => toggleWilaya(currentWilaya)} className="btn-secondary">
              {currentWilaya.is_active ? 'Désactiver cette wilaya' : 'Activer cette wilaya'}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="admin-card">
          <h2 className="mb-4 text-lg font-semibold text-offwhite">Tarifs</h2>

          {rates.length === 0 ? (
            <p className="mb-4 text-sm text-charcoal-400">Aucun tarif pour cette wilaya.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {rates.map((rate) => (
                <li key={rate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-charcoal-400/15 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <p className="text-offwhite">
                      {rate.method === 'domicile' ? 'Domicile' : 'Point relais'} ·{' '}
                      {formatDzd(rate.price_dzd)}
                      {!rate.is_active && <span className="text-charcoal-400"> · inactif</span>}
                    </p>
                    <p className="text-xs text-charcoal-400">
                      {rate.commune_id
                        ? communes.find((commune) => commune.id === rate.commune_id)?.name_fr ?? 'Commune'
                        : 'Toute la wilaya'}
                      {rate.carrier ? ` · ${rate.carrier}` : ''}
                      {rate.estimated_days_min != null
                        ? ` · ${rate.estimated_days_min}${rate.estimated_days_max != null ? `–${rate.estimated_days_max}` : ''} j`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => editRate(rate)} className="text-xs text-charcoal-300 hover:text-offwhite">
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRate(rate.id)}
                      className="text-charcoal-400 hover:text-brand-red"
                      aria-label="Supprimer le tarif"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={saveRate} className="space-y-3 border-t border-charcoal-400/15 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label-text">Mode</span>
                <select
                  value={form.method}
                  onChange={(event) => setForm({ ...form, method: event.target.value as 'domicile' | 'stopdesk' })}
                  className="input-field"
                >
                  <option value="domicile">Livraison à domicile</option>
                  <option value="stopdesk">Point relais / Stop Desk</option>
                </select>
              </label>
              <label className="block">
                <span className="label-text">Portée</span>
                <select
                  value={form.scope}
                  onChange={(event) => setForm({ ...form, scope: event.target.value as 'wilaya' | 'commune' })}
                  className="input-field"
                >
                  <option value="wilaya">Toute la wilaya</option>
                  <option value="commune">Une commune</option>
                </select>
              </label>
              {form.scope === 'commune' && (
                <label className="block sm:col-span-2">
                  <span className="label-text">Commune</span>
                  <select
                    value={form.commune_id}
                    onChange={(event) => setForm({ ...form, commune_id: event.target.value })}
                    className="input-field"
                  >
                    <option value="">Sélectionner...</option>
                    {communes.map((commune) => (
                      <option key={commune.id} value={commune.id}>{commune.name_fr}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="label-text">Prix (DA)</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={form.price_dzd}
                  onChange={(event) => setForm({ ...form, price_dzd: event.target.value })}
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="label-text">Transporteur</span>
                <input
                  type="text"
                  value={form.carrier}
                  onChange={(event) => setForm({ ...form, carrier: event.target.value })}
                  className="input-field"
                  placeholder="Ex: Yalidine"
                />
              </label>
              <label className="block">
                <span className="label-text">Délai min (jours)</span>
                <input
                  type="number"
                  min={0}
                  value={form.days_min}
                  onChange={(event) => setForm({ ...form, days_min: event.target.value })}
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="label-text">Délai max (jours)</span>
                <input
                  type="number"
                  min={0}
                  value={form.days_max}
                  onChange={(event) => setForm({ ...form, days_max: event.target.value })}
                  className="input-field"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-charcoal-200">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                className="h-4 w-4 accent-brand-red"
              />
              Tarif actif
            </label>

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editingId ? 'Enregistrer' : 'Ajouter le tarif'}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="btn-ghost">
                  Annuler
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Points relais</h2>
            {points.length === 0 ? (
              <p className="mb-4 text-sm text-charcoal-400">Aucun point relais pour cette wilaya.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {points.map((point) => (
                  <li key={point.id} className="flex items-center justify-between gap-2 rounded-lg border border-charcoal-400/15 px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <p className="truncate text-offwhite">{point.name}</p>
                      <p className="truncate text-xs text-charcoal-400">{point.address ?? '—'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deletePoint(point.id)}
                      className="text-charcoal-400 hover:text-brand-red"
                      aria-label="Supprimer le point relais"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3 border-t border-charcoal-400/15 pt-4">
              <input
                type="text"
                value={pointName}
                onChange={(event) => setPointName(event.target.value)}
                className="input-field"
                placeholder="Nom du point relais"
              />
              <input
                type="text"
                value={pointAddress}
                onChange={(event) => setPointAddress(event.target.value)}
                className="input-field"
                placeholder="Adresse"
              />
              <select
                value={pointCommune}
                onChange={(event) => setPointCommune(event.target.value)}
                className="input-field"
              >
                <option value="">Commune (optionnel)</option>
                {communes.map((commune) => (
                  <option key={commune.id} value={commune.id}>{commune.name_fr}</option>
                ))}
              </select>
              <button type="button" onClick={addPoint} className="btn-secondary w-full">
                <Plus className="h-4 w-4" />
                Ajouter le point relais
              </button>
            </div>
          </div>

          <div className="admin-card">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-offwhite">
              <Truck className="h-4 w-4 text-brand-red" />
              Aperçu du devis client
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={previewCommune}
                onChange={(event) => setPreviewCommune(event.target.value)}
                className="input-field"
              >
                <option value="">Sans commune</option>
                {communes.map((commune) => (
                  <option key={commune.id} value={commune.id}>{commune.name_fr}</option>
                ))}
              </select>
              <select
                value={previewMethod}
                onChange={(event) => setPreviewMethod(event.target.value as 'domicile' | 'stopdesk')}
                className="input-field"
              >
                <option value="domicile">Domicile</option>
                <option value="stopdesk">Point relais</option>
              </select>
            </div>
            <button type="button" onClick={runPreview} className="btn-secondary mt-3 w-full">
              Vérifier le tarif appliqué
            </button>
            <div className="mt-3 text-sm">
              {preview ? (
                <p className="text-offwhite">
                  {formatDzd(preview.price_dzd)}
                  {preview.carrier ? ` · ${preview.carrier}` : ''}
                  {preview.estimated_days_min != null
                    ? ` · ${preview.estimated_days_min}${preview.estimated_days_max != null ? `–${preview.estimated_days_max}` : ''} jours`
                    : ''}
                </p>
              ) : previewError ? (
                <p className="text-brand-red-light">{previewError}</p>
              ) : (
                <p className="text-charcoal-400">Aucun aperçu calculé.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
