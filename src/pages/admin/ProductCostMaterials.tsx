import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Coins } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'

type Material = { id: string; name: string; cost_per_kg_dzd: number; unit_type: 'piece' | 'meter' | 'm2' | 'kg'; unit_cost_dzd: number; unit_cost_configured: boolean; is_active: boolean }

export default function ProductCostMaterialsPage() {
  const confirmAction = useAdminConfirm()
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialName, setMaterialName] = useState('')
  const [materialCost, setMaterialCost] = useState('')
  const [materialUnit, setMaterialUnit] = useState<Material['unit_type']>('kg')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('materials')
      .select('id, name, cost_per_kg_dzd, unit_type, unit_cost_dzd, unit_cost_configured, is_active').order('name')
    if (loadError) setError('Impossible de charger les matières et leurs coûts.')
    else { setError(null); setMaterials((data as Material[]) ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const addMaterial = async () => {
    setError(null)
    const cost = Number(materialCost)
    if (!materialName.trim() || !Number.isFinite(cost) || cost <= 0) {
      setError('Renseignez un nom de matière et un coût strictement positif par unité.')
      return
    }
    setBusy(true)
    const { error: insertError } = await supabase.from('materials').insert({
      name: materialName.trim(),
      cost_per_kg_dzd: materialUnit === 'kg' ? Math.round(cost) : 0,
      unit_type: materialUnit,
      unit_cost_dzd: Math.round(cost),
      unit_cost_configured: true,
    })
    setBusy(false)
    if (insertError) { setError('Impossible d’ajouter cette matière (nom déjà utilisé ?).'); return }
    setMaterialName(''); setMaterialCost(''); setMaterialUnit('kg')
    await load()
  }

  const updateMaterialCost = async (material: Material, cost: string) => {
    const parsed = Number(cost)
    if (!Number.isFinite(parsed) || parsed < 0) { setError('Le coût doit être un nombre positif ou nul.'); return }
    const { error: updateError } = await supabase.from('materials')
      .update({
        unit_cost_dzd: Math.round(parsed),
        unit_cost_configured: true,
        ...(material.unit_type === 'kg' ? { cost_per_kg_dzd: Math.round(parsed) } : {}),
      }).eq('id', material.id)
    if (updateError) setError('Impossible de mettre à jour ce coût.')
    else await load()
  }

  const deleteMaterial = async (material: Material) => {
    const accepted = await confirmAction({
      title: 'Supprimer cette matière ?',
      description: 'Les fiches de coût associées perdront leur matière. Cette opération ne supprime pas les fiches de coût.',
      confirmLabel: 'Supprimer la matière', tone: 'danger',
    })
    if (!accepted) return
    const { error: deleteError } = await supabase.from('materials').delete().eq('id', material.id)
    if (deleteError) { setError('Impossible de supprimer cette matière.'); return }
    await load()
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Tarification</p>
          <h1 className="text-2xl font-bold text-offwhite">Matières premières</h1>
          <p className="mt-2 max-w-2xl text-sm text-charcoal-400">Un seul catalogue pour les coûts par pièce, mètre, m² et kilogramme. Les matières au kg alimentent aussi les fiches de coût produit.</p>
        </div>
      </header>
      {error && <div role="alert" className="admin-feedback admin-feedback-error">{error}</div>}
      <section className="admin-card">
        <div className="mb-4 flex items-center gap-2">
          <Coins className="h-5 w-5 text-brand-red-light" />
          <div><h2 className="text-lg font-semibold text-offwhite">Catalogue des matières</h2><p className="text-xs text-charcoal-400">Catalogue interne · prix d’achat par unité</p></div>
        </div>
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-brand-red" /></div> :
          materials.length === 0 ? <p className="py-6 text-sm text-charcoal-400">Aucune matière enregistrée.</p> :
          <ul className="mb-6 divide-y divide-charcoal-400/10">
            {materials.map((material) => <li key={material.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="text-sm font-medium text-offwhite">{material.name}</p><p className="text-xs text-charcoal-500">{material.unit_cost_configured ? `Prix configuré · ${material.unit_type === 'piece' ? 'pièce' : material.unit_type === 'meter' ? 'mètre' : material.unit_type === 'm2' ? 'm²' : 'kg'}` : 'Prix à configurer avant tout devis'}</p></div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`material-cost-${material.id}`}>Coût par unité de {material.name}</label>
                <input id={`material-cost-${material.id}`} type="number" min={0} step={1} defaultValue={material.unit_cost_dzd} onBlur={(event) => void updateMaterialCost(material, event.target.value)} className="input-field w-32 py-2" />
                <span className="text-xs text-charcoal-400">DA / {material.unit_type === 'piece' ? 'pièce' : material.unit_type === 'meter' ? 'm' : material.unit_type === 'm2' ? 'm²' : 'kg'}</span>
                <button type="button" onClick={() => void deleteMaterial(material)} className="btn-icon-danger" aria-label={`Supprimer ${material.name}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>)}
          </ul>}
        <form onSubmit={(event) => { event.preventDefault(); void addMaterial() }} className="grid gap-3 border-t border-charcoal-400/15 pt-5 sm:grid-cols-[minmax(0,1fr)_9rem_10rem_auto]">
          <label className="block"><span className="label-text">Nom de la matière</span><input type="text" value={materialName} onChange={(event) => setMaterialName(event.target.value)} className="input-field" placeholder="Ex. PLA noir" required /></label>
          <label className="block"><span className="label-text">Unité de prix</span><select value={materialUnit} onChange={(event) => setMaterialUnit(event.target.value as Material['unit_type'])} className="input-field"><option value="piece">Pièce</option><option value="meter">Mètre</option><option value="m2">Mètre carré</option><option value="kg">Kilogramme</option></select></label>
          <label className="block"><span className="label-text">Coût (DA / unité)</span><input type="number" min={0} step={1} value={materialCost} onChange={(event) => setMaterialCost(event.target.value)} className="input-field" placeholder="Ex. 2500" required /></label>
          <div className="flex items-end"><button type="submit" disabled={busy} className="btn-primary w-full sm:w-auto">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Ajouter</button></div>
        </form>
      </section>
    </div>
  )
}
