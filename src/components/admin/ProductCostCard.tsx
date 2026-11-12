import { useCallback, useEffect, useState } from 'react'
import { Calculator, Loader2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'

type Material = { id: string; name: string; cost_per_kg_dzd: number }
type CostRow = {
  material_id: string | null
  print_grams: number
  print_hours: number
  machine_hour_rate_dzd: number
  labor_minutes: number
  labor_hour_rate_dzd: number
  packaging_dzd: number
  failure_rate_pct: number
  return_reserve_dzd: number
}
type Estimate = {
  is_estimate: boolean
  material_manquante: boolean
  material_dzd: number
  machine_dzd: number
  labour_dzd: number
  failures_dzd: number
  packaging_dzd: number
  return_reserve_dzd: number
  total_cost_dzd: number
  price_dzd: number
  margin_dzd: number
  margin_pct: number | null
  markup_pct: number | null
}

const EMPTY: Record<keyof Omit<CostRow, 'material_id'>, string> = {
  print_grams: '',
  print_hours: '',
  machine_hour_rate_dzd: '',
  labor_minutes: '',
  labor_hour_rate_dzd: '',
  packaging_dzd: '',
  failure_rate_pct: '',
  return_reserve_dzd: '',
}

export default function ProductCostCard({ productId }: { productId: string }) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialId, setMaterialId] = useState('')
  const [form, setForm] = useState({ ...EMPTY })
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshEstimate = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('product_cost_estimate', {
      p_product_id: productId,
    })
    if (rpcError || !data) return
    setEstimate(data as Estimate)
  }, [productId])

  useEffect(() => {
    ;(async () => {
      const [{ data: mats }, { data: cost }] = await Promise.all([
        supabase.from('materials').select('id, name, cost_per_kg_dzd').eq('is_active', true).order('name'),
        supabase.from('product_costs').select('*').eq('product_id', productId).maybeSingle(),
      ])
      setMaterials((mats as Material[]) ?? [])

      if (cost) {
        const row = cost as CostRow
        setMaterialId(row.material_id ?? '')
        setForm({
          print_grams: String(row.print_grams ?? ''),
          print_hours: String(row.print_hours ?? ''),
          machine_hour_rate_dzd: String(row.machine_hour_rate_dzd ?? ''),
          labor_minutes: String(row.labor_minutes ?? ''),
          labor_hour_rate_dzd: String(row.labor_hour_rate_dzd ?? ''),
          packaging_dzd: String(row.packaging_dzd ?? ''),
          failure_rate_pct: String(row.failure_rate_pct ?? ''),
          return_reserve_dzd: String(row.return_reserve_dzd ?? ''),
        })
      }

      await refreshEstimate()
      setLoading(false)
    })()
  }, [productId, refreshEstimate])

  const number = (value: string) => (value.trim() ? Number(value) : 0)

  const save = async () => {
    setError(null)
    setSaving(true)
    const { error: writeError } = await supabase.from('product_costs').upsert(
      {
        product_id: productId,
        material_id: materialId || null,
        print_grams: number(form.print_grams),
        print_hours: number(form.print_hours),
        machine_hour_rate_dzd: Math.round(number(form.machine_hour_rate_dzd)),
        labor_minutes: Math.round(number(form.labor_minutes)),
        labor_hour_rate_dzd: Math.round(number(form.labor_hour_rate_dzd)),
        packaging_dzd: Math.round(number(form.packaging_dzd)),
        failure_rate_pct: number(form.failure_rate_pct),
        return_reserve_dzd: Math.round(number(form.return_reserve_dzd)),
      },
      { onConflict: 'product_id' }
    )
    setSaving(false)

    if (writeError) {
      setError("Impossible d'enregistrer ces coûts.")
      return
    }
    await refreshEstimate()
  }

  if (loading) {
    return (
      <div className="admin-card">
        <Loader2 className="h-5 w-5 animate-spin text-brand-red" />
      </div>
    )
  }

  return (
    <div className="admin-card">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-offwhite">
        <Calculator className="h-4 w-4 text-brand-red" />
        Coûts de production
      </h2>
      <p className="mb-4 text-xs text-charcoal-400">
        Estimation à partir de vos coûts réels configurés. Chaque poste n'est compté qu'une fois.
        Ce sont des estimations, pas une comptabilité vérifiée.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-brand-red-light">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="label-text">Matière</span>
          <select value={materialId} onChange={(event) => setMaterialId(event.target.value)} className="input-field">
            <option value="">Non définie</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name} — {formatDzd(material.cost_per_kg_dzd)}/kg
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-text">Masse imprimée (g)</span>
          <input
            type="number"
            min={0}
            value={form.print_grams}
            onChange={(event) => setForm({ ...form, print_grams: event.target.value })}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-text">Temps d'impression (h)</span>
          <input
            type="number"
            min={0}
            step="0.1"
            value={form.print_hours}
            onChange={(event) => setForm({ ...form, print_hours: event.target.value })}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-text">Coût machine (DA / h)</span>
          <input
            type="number"
            min={0}
            value={form.machine_hour_rate_dzd}
            onChange={(event) => setForm({ ...form, machine_hour_rate_dzd: event.target.value })}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-text">Taux d'échec (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={form.failure_rate_pct}
            onChange={(event) => setForm({ ...form, failure_rate_pct: event.target.value })}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-text">Main-d'œuvre (min)</span>
          <input
            type="number"
            min={0}
            value={form.labor_minutes}
            onChange={(event) => setForm({ ...form, labor_minutes: event.target.value })}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-text">Coût main-d'œuvre (DA / h)</span>
          <input
            type="number"
            min={0}
            value={form.labor_hour_rate_dzd}
            onChange={(event) => setForm({ ...form, labor_hour_rate_dzd: event.target.value })}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-text">Emballage (DA)</span>
          <input
            type="number"
            min={0}
            value={form.packaging_dzd}
            onChange={(event) => setForm({ ...form, packaging_dzd: event.target.value })}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-text">Réserve retours (DA)</span>
          <input
            type="number"
            min={0}
            value={form.return_reserve_dzd}
            onChange={(event) => setForm({ ...form, return_reserve_dzd: event.target.value })}
            className="input-field"
          />
        </label>
      </div>

      <button type="button" onClick={save} disabled={saving} className="btn-secondary mt-3 w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Enregistrer les coûts
      </button>

      {estimate && (
        <div className="mt-4 space-y-1 border-t border-charcoal-400/15 pt-3 text-sm">
          {estimate.material_manquante && (
            <p className="mb-2 text-xs text-yellow-400">
              Matière ou masse manquante : le coût matière est estimé à 0 DA.
            </p>
          )}
          <div className="flex justify-between text-charcoal-300">
            <span>Matière</span>
            <span>{formatDzd(estimate.material_dzd)}</span>
          </div>
          <div className="flex justify-between text-charcoal-300">
            <span>Machine</span>
            <span>{formatDzd(estimate.machine_dzd)}</span>
          </div>
          <div className="flex justify-between text-charcoal-300">
            <span>Main-d'œuvre</span>
            <span>{formatDzd(estimate.labour_dzd)}</span>
          </div>
          <div className="flex justify-between text-charcoal-300">
            <span>Pertes / échecs</span>
            <span>{formatDzd(estimate.failures_dzd)}</span>
          </div>
          <div className="flex justify-between text-charcoal-300">
            <span>Emballage</span>
            <span>{formatDzd(estimate.packaging_dzd)}</span>
          </div>
          <div className="flex justify-between text-charcoal-300">
            <span>Réserve retours</span>
            <span>{formatDzd(estimate.return_reserve_dzd)}</span>
          </div>
          <div className="flex justify-between border-t border-charcoal-400/15 pt-1 font-semibold text-offwhite">
            <span>Coût total estimé</span>
            <span>{formatDzd(estimate.total_cost_dzd)}</span>
          </div>
          <div className="flex justify-between text-charcoal-200">
            <span>Prix de vente</span>
            <span>{formatDzd(estimate.price_dzd)}</span>
          </div>
          <div className="flex justify-between text-charcoal-200">
            <span>Marge</span>
            <span>{formatDzd(estimate.margin_dzd)}</span>
          </div>
          <div className="flex justify-between text-xs text-charcoal-400">
            <span>Marge sur prix</span>
            <span>{estimate.margin_pct != null ? `${estimate.margin_pct} %` : '—'}</span>
          </div>
          <div className="flex justify-between text-xs text-charcoal-400">
            <span>Markup sur coût</span>
            <span>{estimate.markup_pct != null ? `${estimate.markup_pct} %` : '—'}</span>
          </div>
          <p className="pt-1 text-xs text-charcoal-500">
            La marge et le markup sont deux indicateurs différents : ne les confondez pas.
          </p>
        </div>
      )}
    </div>
  )
}
