import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calculator, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  calculateCustomManufacturingCost,
  type CostingMaterial,
  type CustomManufacturingCostInput,
  type ManufacturingCostSettings,
  type ManufacturingUnit,
} from '@/lib/custom-manufacturing-cost'

type RequestOption = { id: string; request_number: string; customer_name: string; title: string; status: string }
type MaterialRow = CostingMaterial & { isActive: boolean }
type CostLine = { materialId: string; quantity: string }

const defaultSettings: ManufacturingCostSettings = {
  laborHourRateDzd: 0,
  machineHourRateDzd: 0,
  assemblyHourRateDzd: 0,
  finishingHourRateDzd: 0,
  wastePercent: 0,
  taxPercent: 0,
  marginPercent: 0,
  minimumQuoteDzd: 0,
}

const localDateAfterDays = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

const unitLabel: Record<ManufacturingUnit, string> = {
  piece: 'pièce', meter: 'mètre', m2: 'm²', kg: 'kg',
}

const formatDzd = (value: number) => `${new Intl.NumberFormat('fr-DZ').format(value)} DA`

export default function CustomCostingPage() {
  const [requests, setRequests] = useState<RequestOption[]>([])
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [requestId, setRequestId] = useState('')
  const [settings, setSettings] = useState<ManufacturingCostSettings>(defaultSettings)
  const [lines, setLines] = useState<CostLine[]>([{ materialId: '', quantity: '1' }])
  const [laborMinutes, setLaborMinutes] = useState('0')
  const [machineHours, setMachineHours] = useState('0')
  const [assemblyMinutes, setAssemblyMinutes] = useState('0')
  const [finishingMinutes, setFinishingMinutes] = useState('0')
  const [packagingDzd, setPackagingDzd] = useState('0')
  const [transportDzd, setTransportDzd] = useState('0')
  const [extraDzd, setExtraDzd] = useState('0')
  const [leadDays, setLeadDays] = useState('14')
  const [validUntil, setValidUntil] = useState(localDateAfterDays(14))
  const [terms, setTerms] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [creatingQuote, setCreatingQuote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [requestResult, materialResult, settingsResult] = await Promise.all([
      supabase.from('custom_requests').select('id, request_number, customer_name, title, status')
        .not('status', 'in', '("approved","closed","rejected")')
        .is('deletion_started_at', null)
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('materials').select('id, name, unit_type, unit_cost_dzd, unit_cost_configured, is_active')
        .eq('is_active', true).order('name'),
      supabase.from('manufacturing_cost_settings').select('*').eq('id', true).maybeSingle(),
    ])
    if (requestResult.error || materialResult.error || settingsResult.error) {
      setError('Impossible de charger les demandes, matières ou paramètres. Vérifiez que la migration 028 est appliquée.')
    } else {
      setRequests((requestResult.data ?? []) as RequestOption[])
      setMaterials(((materialResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        unitType: row.unit_type as ManufacturingUnit,
        unitCostDzd: Number(row.unit_cost_dzd ?? 0),
        unitCostConfigured: Boolean(row.unit_cost_configured),
        isActive: Boolean(row.is_active),
      })))
      if (settingsResult.data) {
        const row = settingsResult.data
        setSettings({
          laborHourRateDzd: Number(row.labor_hour_rate_dzd ?? 0),
          machineHourRateDzd: Number(row.machine_hour_rate_dzd ?? 0),
          assemblyHourRateDzd: Number(row.assembly_hour_rate_dzd ?? 0),
          finishingHourRateDzd: Number(row.finishing_hour_rate_dzd ?? 0),
          wastePercent: Number(row.waste_percent ?? 0),
          taxPercent: Number(row.tax_percent ?? 0),
          marginPercent: Number(row.margin_percent ?? 0),
          minimumQuoteDzd: Number(row.minimum_quote_dzd ?? 0),
        })
      }
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const input = useMemo<CustomManufacturingCostInput>(() => ({
    materials: materials.filter((material) => material.isActive),
    lines: lines.filter((line) => line.materialId && line.quantity.trim()).map((line) => ({
      materialId: line.materialId,
      quantity: Number(line.quantity),
    })),
    settings,
    laborMinutes: Number(laborMinutes),
    machineHours: Number(machineHours),
    assemblyMinutes: Number(assemblyMinutes),
    finishingMinutes: Number(finishingMinutes),
    packagingDzd: Number(packagingDzd),
    transportDzd: Number(transportDzd),
    extraDzd: Number(extraDzd),
  }), [materials, lines, settings, laborMinutes, machineHours, assemblyMinutes, finishingMinutes, packagingDzd, transportDzd, extraDzd])

  const estimate = useMemo(() => {
    try { return { value: calculateCustomManufacturingCost(input), error: null as string | null } }
    catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : 'Calcul impossible' } }
  }, [input])

  const setSetting = (key: keyof ManufacturingCostSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: Number(value) }))
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    setError(null)
    setNotice(null)
    const { error: saveError } = await supabase.from('manufacturing_cost_settings').upsert({
      id: true,
      labor_hour_rate_dzd: Math.round(settings.laborHourRateDzd),
      machine_hour_rate_dzd: Math.round(settings.machineHourRateDzd),
      assembly_hour_rate_dzd: Math.round(settings.assemblyHourRateDzd),
      finishing_hour_rate_dzd: Math.round(settings.finishingHourRateDzd),
      waste_percent: settings.wastePercent,
      tax_percent: settings.taxPercent,
      margin_percent: settings.marginPercent,
      minimum_quote_dzd: Math.round(settings.minimumQuoteDzd),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    setSavingSettings(false)
    if (saveError) setError('Impossible d’enregistrer les paramètres de coût.')
    else setNotice('Paramètres de fabrication enregistrés.')
  }

  const createQuote = async () => {
    if (!requestId) { setError('Sélectionnez une demande client.'); return }
    if (!estimate.value) { setError('Corrigez les données de coût avant de créer le devis.'); return }
    if (!validUntil || validUntil < localDateAfterDays(0)) { setError('La date de validité doit être aujourd’hui ou ultérieure.'); return }
    const materialLines = input.lines
    if (materialLines.length === 0 && estimate.value.costBeforeMarginDzd <= 0) { setError('Ajoutez au moins un coût de production.'); return }

    setCreatingQuote(true)
    setError(null)
    setNotice(null)
    const { data, error: quoteError } = await supabase.rpc('create_custom_quote_from_costing', {
      p_request_id: requestId,
      p_material_lines: materialLines.map((line) => ({ material_id: line.materialId, quantity: line.quantity })),
      p_labor_minutes: input.laborMinutes,
      p_machine_hours: input.machineHours,
      p_assembly_minutes: input.assemblyMinutes,
      p_finishing_minutes: input.finishingMinutes,
      p_packaging_dzd: Math.round(input.packagingDzd),
      p_transport_dzd: Math.round(input.transportDzd),
      p_extra_dzd: Math.round(input.extraDzd),
      p_lead_days: Number(leadDays),
      p_valid_until: validUntil,
      p_terms: terms.trim() || null,
    })
    setCreatingQuote(false)
    if (quoteError) {
      setError(quoteError.message.includes('PRIX_MATIERE_NON_CONFIGURE')
        ? 'Une matière sélectionnée ne possède pas de prix d’achat configuré.'
        : 'Le serveur a refusé le devis. Vérifiez les paramètres et la demande sélectionnée.')
      return
    }
    const result = data as { quote_id: string; version: number; price_dzd: number }
    setNotice(`Devis ${result.quote_id} · version ${result.version} créé au prix de ${formatDzd(result.price_dzd)}. Le prix a été recalculé côté serveur.`)
    await load()
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-brand-red" /></div>

  return (
    <div className="animate-fade-in space-y-6">
      <header className="admin-page-header">
        <div><p className="admin-eyebrow">Tarification</p><h1 className="text-2xl font-bold text-offwhite">Calculateur de coûts sur mesure</h1><p className="mt-2 text-sm text-charcoal-400">Le navigateur fournit un aperçu. PostgreSQL recalcule les prix à partir des coûts actuels avant d’émettre chaque version du devis.</p></div>
      </header>
      {error && <div role="alert" className="admin-feedback admin-feedback-error">{error}</div>}
      {notice && <div role="status" className="admin-feedback admin-feedback-success">{notice}</div>}

      <section className="admin-card space-y-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-offwhite">Taux et règles de fabrication</h2><p className="text-xs text-charcoal-400">Ces paramètres sont internes et ne sont pas exposés au client.</p></div><button type="button" onClick={() => void saveSettings()} disabled={savingSettings} className="btn-secondary">{savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Enregistrer les taux</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ['laborHourRateDzd', 'Main-d’œuvre (DA/h)'],
            ['machineHourRateDzd', 'Machine (DA/h)'],
            ['assemblyHourRateDzd', 'Assemblage (DA/h)'],
            ['finishingHourRateDzd', 'Finition (DA/h)'],
            ['wastePercent', 'Perte matière (%)'],
            ['marginPercent', 'Marge brute (%)'],
            ['taxPercent', 'Taxe (%)'],
            ['minimumQuoteDzd', 'Devis minimum (DA)'],
          ] as Array<[keyof ManufacturingCostSettings, string]>).map(([key, label]) => <label key={key} className="block"><span className="label-text">{label}</span><input type="number" min="0" step={key.endsWith('Percent') ? '0.1' : '1'} max={key === 'marginPercent' ? 90 : key === 'taxPercent' ? 30 : key === 'wastePercent' ? 100 : undefined} value={settings[key]} onChange={(event) => setSetting(key, event.target.value)} className="input-field" /></label>)}
        </div>
      </section>

      <section className="admin-card space-y-4">
        <div><h2 className="font-semibold text-offwhite">Demande et matières</h2><p className="text-xs text-charcoal-400">Choisissez une demande puis ajoutez les matières réellement nécessaires.</p></div>
        <label className="block"><span className="label-text">Demande client</span><select value={requestId} onChange={(event) => setRequestId(event.target.value)} className="input-field"><option value="">Sélectionner une demande</option>{requests.map((request) => <option key={request.id} value={request.id}>{request.request_number} — {request.title} · {request.customer_name}</option>)}</select></label>
        <div className="space-y-3">
          {lines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <label className="block"><span className="label-text">Matière</span><select value={line.materialId} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, materialId: event.target.value } : item))} className="input-field"><option value="">Sélectionner une matière</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} · {material.unitCostConfigured ? `${formatDzd(material.unitCostDzd)}/${unitLabel[material.unitType]}` : 'prix manquant'}</option>)}</select></label>
            <label className="block"><span className="label-text">Quantité</span><input type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} className="input-field" /></label>
            <div className="flex items-end"><button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="btn-icon-danger" aria-label="Supprimer cette matière"><Trash2 className="h-4 w-4" /></button></div>
          </div>)}
          <button type="button" onClick={() => setLines((current) => [...current, { materialId: '', quantity: '1' }])} className="btn-secondary"><Plus className="h-4 w-4" />Ajouter une matière</button>
        </div>
      </section>

      <section className="admin-card space-y-4">
        <h2 className="font-semibold text-offwhite">Temps et frais complémentaires</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            [laborMinutes, setLaborMinutes, 'Main-d’œuvre (minutes)'],
            [machineHours, setMachineHours, 'Machine (heures)'],
            [assemblyMinutes, setAssemblyMinutes, 'Assemblage (minutes)'],
            [finishingMinutes, setFinishingMinutes, 'Finition (minutes)'],
            [packagingDzd, setPackagingDzd, 'Emballage (DA)'],
            [transportDzd, setTransportDzd, 'Transport de production (DA)'],
            [extraDzd, setExtraDzd, 'Autres frais (DA)'],
          ] as Array<[string, (value: string) => void, string]>).map(([value, setter, label]) => <label key={label} className="block"><span className="label-text">{label}</span><input type="number" min="0" step="any" value={value} onChange={(event) => setter(event.target.value)} className="input-field" /></label>)}
        </div>
      </section>

      <section className="admin-card space-y-4">
        <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-brand-red-light" /><h2 className="font-semibold text-offwhite">Aperçu des coûts</h2></div>
        {estimate.value ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['Matières', estimate.value.materialCostDzd],
            ['Main-d’œuvre', estimate.value.laborCostDzd],
            ['Machines', estimate.value.machineCostDzd],
            ['Assemblage', estimate.value.assemblyCostDzd],
            ['Finition', estimate.value.finishingCostDzd],
            ['Emballage + transport + autres', estimate.value.packagingDzd + estimate.value.transportDzd + estimate.value.extraDzd],
            ['Coût de revient', estimate.value.costBeforeMarginDzd],
            ['Bénéfice brut', estimate.value.profitDzd],
            ['Taxes', estimate.value.taxDzd],
            ['Temps de production estimé', estimate.value.estimatedProductionHours],
          ] as Array<[string, number]>).map(([label, value]) => <div key={label} className="rounded-lg bg-charcoal-950 p-3"><p className="text-xs text-charcoal-400">{label}</p><p className="mt-1 font-semibold text-offwhite">{label === 'Temps de production estimé' ? `${value.toFixed(2)} h` : formatDzd(value)}</p></div>)}
          <div className="rounded-lg border border-brand-red/30 bg-brand-red/5 p-3 sm:col-span-2 lg:col-span-3"><p className="text-xs text-charcoal-300">Prix de vente estimé (DZD)</p><p className="mt-1 text-2xl font-bold text-offwhite">{formatDzd(estimate.value.finalPriceDzd)}</p><p className="text-xs text-charcoal-400">Marge brute {estimate.value.marginPercent}% · perte {estimate.value.wastePercent}% · taxe {estimate.value.taxPercent}%</p></div>
        </div> : <p className="text-sm text-amber-300">Aperçu indisponible : {estimate.error}. Configurez les taux et les prix des matières, ou complétez les quantités.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label-text">Délai de fabrication (jours)</span><input type="number" min="0" max="365" value={leadDays} onChange={(event) => setLeadDays(event.target.value)} className="input-field" /></label>
          <label className="block"><span className="label-text">Devis valable jusqu’au</span><input type="date" min={localDateAfterDays(0)} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="input-field" /></label>
        </div>
        <label className="block"><span className="label-text">Conditions et remarques (facultatif)</span><textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={3} maxLength={2000} className="input-field" placeholder="Conditions de fabrication, finition, tolérances…"/></label>
        <button type="button" onClick={() => void createQuote()} disabled={creatingQuote || !estimate.value || !requestId} className="btn-primary">{creatingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}Créer un devis versionné</button>
      </section>
    </div>
  )
}
