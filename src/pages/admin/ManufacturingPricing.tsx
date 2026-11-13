import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type MfgMaterial = {
  id: string
  name: string
  price_per_gram_dzd: number
  multiplier: number
  colors: string[]
  is_available: boolean
  sort_order: number
}

type MfgPricing = {
  price_per_hour_dzd: number
  machine_hourly_cost_dzd: number
  electricity_per_hour_dzd: number
  minimum_print_charge_dzd: number
  extra_production_dzd: number
  design_preparation_fee_dzd: number
  modeling_fee_dzd: number
  assembly_fee_dzd: number
  finishing_fee_dzd: number
  painting_fee_dzd: number
  margin_percent: number
  minimum_order_dzd: number
  complexity_fee_dzd: number
  waste_percent: number
  quantity_discounts: { minQuantity: number; percent: number }[]
  rush_fee_percent: number
  validity_days: number
}

const emptyPricing: MfgPricing = {
  price_per_hour_dzd: 0,
  machine_hourly_cost_dzd: 0,
  electricity_per_hour_dzd: 0,
  minimum_print_charge_dzd: 0,
  extra_production_dzd: 0,
  design_preparation_fee_dzd: 0,
  modeling_fee_dzd: 0,
  assembly_fee_dzd: 0,
  finishing_fee_dzd: 0,
  painting_fee_dzd: 0,
  margin_percent: 0,
  minimum_order_dzd: 0,
  complexity_fee_dzd: 0,
  waste_percent: 0,
  quantity_discounts: [],
  rush_fee_percent: 0,
  validity_days: 14,
}

export default function ManufacturingPricingPage() {
  const [materials, setMaterials] = useState<MfgMaterial[]>([])
  const [pricing, setPricing] = useState<MfgPricing>(emptyPricing)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [newMaterialName, setNewMaterialName] = useState('')
  const [newMaterialPrice, setNewMaterialPrice] = useState('')
  const [newMaterialMultiplier, setNewMaterialMultiplier] = useState('1')
  const [newMaterialColors, setNewMaterialColors] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: mats }, { data: rules }] = await Promise.all([
      supabase.from('manufacturing_materials').select('*').order('sort_order').order('name'),
      supabase.from('manufacturing_pricing').select('*').eq('id', true).maybeSingle(),
    ])
    setMaterials((mats as MfgMaterial[]) ?? [])
    if (rules) {
      const row = rules as Record<string, unknown>
      setPricing({
        price_per_hour_dzd: Number(row.price_per_hour_dzd ?? 0),
        machine_hourly_cost_dzd: Number(row.machine_hourly_cost_dzd ?? 0),
        electricity_per_hour_dzd: Number(row.electricity_per_hour_dzd ?? 0),
        minimum_print_charge_dzd: Number(row.minimum_print_charge_dzd ?? 0),
        extra_production_dzd: Number(row.extra_production_dzd ?? 0),
        design_preparation_fee_dzd: Number(row.design_preparation_fee_dzd ?? 0),
        modeling_fee_dzd: Number(row.modeling_fee_dzd ?? 0),
        assembly_fee_dzd: Number(row.assembly_fee_dzd ?? 0),
        finishing_fee_dzd: Number(row.finishing_fee_dzd ?? 0),
        painting_fee_dzd: Number(row.painting_fee_dzd ?? 0),
        margin_percent: Number(row.margin_percent ?? 0),
        minimum_order_dzd: Number(row.minimum_order_dzd ?? 0),
        complexity_fee_dzd: Number(row.complexity_fee_dzd ?? 0),
        waste_percent: Number(row.waste_percent ?? 0),
        quantity_discounts: (row.quantity_discounts as { minQuantity: number; percent: number }[]) ?? [],
        rush_fee_percent: Number(row.rush_fee_percent ?? 0),
        validity_days: Number(row.validity_days ?? 14),
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const savePricing = async () => {
    setError(null)
    setSaved(false)
    setSaving(true)
    const { error: writeError } = await supabase
      .from('manufacturing_pricing')
      .upsert({ id: true, ...pricing, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    setSaving(false)
    if (writeError) {
      setError("Impossible d'enregistrer la tarification.")
      return
    }
    setSaved(true)
  }

  const addMaterial = async () => {
    setError(null)
    if (!newMaterialName.trim()) {
      setError('Nom de matière requis.')
      return
    }
    const price = Number(newMaterialPrice)
    if (!Number.isFinite(price) || price < 0) {
      setError('Prix par gramme invalide.')
      return
    }
    const multiplier = Number(newMaterialMultiplier)
    const colors = newMaterialColors
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    const { error: insertError } = await supabase.from('manufacturing_materials').insert({
      name: newMaterialName.trim(),
      price_per_gram_dzd: Math.round(price),
      multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
      colors,
      is_available: true,
      sort_order: materials.length,
    })
    if (insertError) {
      setError('Impossible d’ajouter cette matière (nom déjà utilisé ?).')
      return
    }
    setNewMaterialName('')
    setNewMaterialPrice('')
    setNewMaterialMultiplier('1')
    setNewMaterialColors('')
    await load()
  }

  const updateMaterial = async (material: MfgMaterial, patch: Partial<MfgMaterial>) => {
    const { error: updateError } = await supabase
      .from('manufacturing_materials')
      .update(patch)
      .eq('id', material.id)
    if (updateError) {
      setError('Impossible de mettre à jour cette matière.')
      return
    }
    await load()
  }

  const deleteMaterial = async (id: string) => {
    if (!confirm('Supprimer cette matière ?')) return
    const { error: deleteError } = await supabase.from('manufacturing_materials').delete().eq('id', id)
    if (deleteError) {
      setError('Impossible de supprimer cette matière.')
      return
    }
    await load()
  }

  const setField = (key: keyof MfgPricing, value: number) => {
    setPricing((current) => ({ ...current, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
      </div>
    )
  }

  const numericFields: { key: keyof MfgPricing; label: string; help?: string }[] = [
    { key: 'price_per_hour_dzd', label: 'Tarif horaire facturé (DA/h)' },
    { key: 'machine_hourly_cost_dzd', label: 'Coût machine (DA/h)' },
    { key: 'electricity_per_hour_dzd', label: 'Électricité (DA/h)' },
    { key: 'minimum_print_charge_dzd', label: 'Plancher d’impression (DA)' },
    { key: 'extra_production_dzd', label: 'Supplément de production (DA)' },
    { key: 'design_preparation_fee_dzd', label: 'Préparation du design (DA)' },
    { key: 'modeling_fee_dzd', label: 'Modélisation / modification (DA)' },
    { key: 'assembly_fee_dzd', label: 'Assemblage (DA)' },
    { key: 'finishing_fee_dzd', label: 'Ponçage et finition (DA)' },
    { key: 'painting_fee_dzd', label: 'Peinture (DA)' },
    { key: 'margin_percent', label: 'Marge (%)' },
    { key: 'minimum_order_dzd', label: 'Prix minimum de commande (DA)' },
    { key: 'complexity_fee_dzd', label: 'Frais de complexité (DA)' },
    { key: 'waste_percent', label: 'Perte matière (%)' },
    { key: 'rush_fee_percent', label: 'Supplément urgence (%)' },
    { key: 'validity_days', label: 'Validité d’un devis (jours)' },
  ]

  return (
    <div className="animate-fade-in">
      <h1 className="mb-2 text-2xl font-bold text-offwhite">Tarification fabrication sur mesure</h1>
      <p className="mb-6 text-sm text-charcoal-400">
        Configurez les matières et les règles de calcul. Les devis automatiques sont recalculés côté
        serveur à partir de ces valeurs ; le navigateur ne fait qu'estimer.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-400">
          Tarification enregistrée.
        </div>
      )}

      <section className="admin-card mb-6">
        <h2 className="mb-4 text-lg font-semibold text-offwhite">Matières</h2>
        {materials.length === 0 ? (
          <p className="mb-4 text-sm text-charcoal-400">Aucune matière configurée.</p>
        ) : (
          <ul className="mb-4 space-y-3">
            {materials.map((material) => (
              <li
                key={material.id}
                className="rounded-lg border border-charcoal-400/15 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-offwhite">{material.name}</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-charcoal-400">
                      <input
                        type="checkbox"
                        checked={material.is_available}
                        onChange={(event) =>
                          updateMaterial(material, { is_available: event.target.checked })
                        }
                        className="h-3.5 w-3.5 accent-brand-red"
                      />
                      Disponible
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteMaterial(material.id)}
                      className="text-charcoal-400 hover:text-brand-red"
                      aria-label={`Supprimer ${material.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="label-text">Prix (DA/g)</span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={material.price_per_gram_dzd}
                      onBlur={(event) =>
                        updateMaterial(material, {
                          price_per_gram_dzd: Math.round(Number(event.target.value) || 0),
                        })
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="block">
                    <span className="label-text">Multiplicateur</span>
                    <input
                      type="number"
                      min={0.1}
                      step="0.1"
                      defaultValue={material.multiplier}
                      onBlur={(event) =>
                        updateMaterial(material, {
                          multiplier: Number(event.target.value) || 1,
                        })
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="label-text">Couleurs (virgules)</span>
                    <input
                      type="text"
                      defaultValue={material.colors.join(', ')}
                      onBlur={(event) =>
                        updateMaterial(material, {
                          colors: event.target.value
                            .split(',')
                            .map((c) => c.trim())
                            .filter(Boolean),
                        })
                      }
                      className="input-field"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <input
            type="text"
            value={newMaterialName}
            onChange={(event) => setNewMaterialName(event.target.value)}
            className="input-field"
            placeholder="Nom (ex: PLA)"
          />
          <input
            type="number"
            min={0}
            value={newMaterialPrice}
            onChange={(event) => setNewMaterialPrice(event.target.value)}
            className="input-field"
            placeholder="DA / g"
          />
          <input
            type="number"
            min={0.1}
            step="0.1"
            value={newMaterialMultiplier}
            onChange={(event) => setNewMaterialMultiplier(event.target.value)}
            className="input-field"
            placeholder="Multiplicateur"
          />
          <input
            type="text"
            value={newMaterialColors}
            onChange={(event) => setNewMaterialColors(event.target.value)}
            className="input-field"
            placeholder="Couleurs"
          />
        </div>
        <button type="button" onClick={addMaterial} className="btn-secondary mt-3">
          <Plus className="h-4 w-4" />
          Ajouter la matière
        </button>
      </section>

      <section className="admin-card mb-6">
        <h2 className="mb-4 text-lg font-semibold text-offwhite">Règles de calcul</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {numericFields.map((field) => (
            <label key={String(field.key)} className="block">
              <span className="label-text">{field.label}</span>
              <input
                type="number"
                min={0}
                value={pricing[field.key] as number}
                onChange={(event) => setField(field.key, Number(event.target.value) || 0)}
                className="input-field"
              />
            </label>
          ))}
        </div>

        <div className="mt-4">
          <span className="label-text">Remises quantité (JSON)</span>
          <textarea
            rows={3}
            value={JSON.stringify(pricing.quantity_discounts)}
            onChange={(event) => {
              try {
                const parsed = JSON.parse(event.target.value)
                if (Array.isArray(parsed)) {
                  setPricing((current) => ({ ...current, quantity_discounts: parsed }))
                }
              } catch {
                // ignore invalid JSON while typing
              }
            }}
            className="input-field resize-none font-mono text-xs"
          />
          <span className="mt-1 block text-xs text-charcoal-500">
            Exemple : [{`{"minQuantity":5,"percent":10}`}, {`{"minQuantity":10,"percent":15}`}]
          </span>
        </div>
      </section>

      <button type="button" onClick={savePricing} disabled={saving} className="btn-primary">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Enregistrer la tarification
      </button>
    </div>
  )
}
