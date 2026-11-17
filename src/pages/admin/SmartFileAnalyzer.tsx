import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  analyzeMaterialsCsv,
  validateExtractedMaterial,
  type CsvAnalysis,
  type ExtractedMaterial,
} from '@/lib/smart-file-analyzer'

const unitLabels: Record<Exclude<ExtractedMaterial['unit'], ''>, string> = {
  piece: 'Pièce',
  meter: 'Mètre',
  m2: 'Mètre carré',
  kg: 'Kilogramme',
}

export default function SmartFileAnalyzerPage() {
  const [analysis, setAnalysis] = useState<CsvAnalysis | null>(null)
  const [fileName, setFileName] = useState('')
  const [sourcePreview, setSourcePreview] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const invalidRows = useMemo(
    () => analysis?.rows.filter((row) => validateExtractedMaterial(row).length > 0) ?? [],
    [analysis]
  )
  const readyRows = useMemo(
    () => analysis?.rows.filter((row) => validateExtractedMaterial(row).length === 0) ?? [],
    [analysis]
  )

  const handleFile = async (file?: File) => {
    setError(null)
    setNotice(null)
    setAnalysis(null)
    setSourcePreview('')
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Le fichier dépasse la limite de 5 Mo.')
      return
    }
    if (!/\.(csv|tsv)$/i.test(file.name)) {
      setError('Cette première version accepte uniquement les fichiers CSV et TSV.')
      return
    }
    try {
      const text = await file.text()
      const result = analyzeMaterialsCsv(text)
      setSourcePreview(text.split(/\r?\n/).slice(0, 12).join('\n'))
      if (result.rows.length === 0) throw new Error('AUCUNE_LIGNE_DONNEES')
      setAnalysis(result)
      setFileName(file.name)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'ANALYSE_IMPOSSIBLE'
      setError(message.startsWith('COLONNES_REQUISES')
        ? 'Colonnes requises introuvables : Material, Quantity et Unit Price (ou leurs équivalents français).'
        : 'Impossible de lire ce fichier. Vérifiez son format et ses colonnes.')
    }
  }

  const updateRow = (index: number, patch: Partial<ExtractedMaterial>) => {
    setAnalysis((current) => current ? ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        ...patch,
        issues: [],
        confidence: 'high',
      } : row),
    }) : current)
  }

  const importMaterials = async () => {
    if (!analysis || readyRows.length === 0) return
    setBusy(true)
    setError(null)
    setNotice(null)

    const names = readyRows.map((row) => row.materialName.trim())
    const { data: existing, error: lookupError } = await supabase
      .from('materials')
      .select('name')
      .in('name', names)

    if (lookupError) {
      setBusy(false)
      setError('Impossible de vérifier les doublons dans le catalogue.')
      return
    }

    const existingNames = new Set((existing ?? []).map((row) => row.name.toLocaleLowerCase()))
    const newRows = readyRows.filter((row) => !existingNames.has(row.materialName.trim().toLocaleLowerCase()))

    if (newRows.length === 0) {
      setBusy(false)
      setNotice('Toutes les matières valides existent déjà. Aucun prix existant n’a été écrasé.')
      return
    }

    const payload = newRows.map((row) => {
      const price = Math.round(Number(row.unitPriceDzd))
      return {
        name: row.materialName.trim(),
        unit_type: row.unit,
        unit_cost_dzd: price,
        unit_cost_configured: true,
        cost_per_kg_dzd: row.unit === 'kg' ? price : 0,
      }
    })

    const { error: insertError } = await supabase.from('materials').insert(payload)
    setBusy(false)
    if (insertError) {
      setError('Enregistrement refusé. Vérifiez les doublons et les droits du compte propriétaire.')
      return
    }
    setNotice(`${newRows.length} matière(s) ajoutée(s). ${readyRows.length - newRows.length} doublon(s) ignoré(s), sans écraser les prix existants.`)
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Outils de fabrication</p>
          <h1 className="text-2xl font-bold text-offwhite">LUNDER Smart File Analyzer</h1>
          <p className="mt-2 max-w-3xl text-sm text-charcoal-400">
            Importez un tableau fournisseur pour extraire les matières, quantités, unités et prix.
            Chaque ligne reste modifiable et doit être vérifiée avant son ajout au catalogue.
          </p>
        </div>
      </header>

      {error && <div role="alert" className="admin-feedback admin-feedback-error"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="admin-feedback admin-feedback-success"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

      <section className="admin-card">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-brand-red/10 p-3 text-brand-red-light"><FileSpreadsheet className="h-6 w-6" /></div>
          <div>
            <h2 className="font-semibold text-offwhite">Importer un tableau de matières</h2>
            <p className="text-xs text-charcoal-400">CSV / TSV · maximum 5 Mo · traitement local dans le navigateur</p>
          </div>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-charcoal-400/30 bg-charcoal-950/50 px-5 py-8 text-center transition hover:border-brand-red/60">
          <Upload className="mb-3 h-7 w-7 text-brand-red-light" />
          <span className="text-sm font-semibold text-offwhite">Choisir un fichier CSV ou TSV</span>
          <span className="mt-1 text-xs text-charcoal-500">Colonnes : Material, Quantity, Unit, Unit Price</span>
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
        </label>
        {fileName && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-charcoal-300"><span>{fileName}</span><button type="button" onClick={() => { setAnalysis(null); setFileName(''); setSourcePreview(''); setNotice(null); setError(null) }} className="rounded-lg p-2 hover:bg-charcoal-800" aria-label="Retirer le fichier"><X className="h-4 w-4" /></button></div>}
        {sourcePreview && <details className="mt-3 rounded-lg border border-charcoal-400/10 bg-charcoal-950 p-3">
          <summary className="cursor-pointer text-xs font-medium text-charcoal-300">Afficher l’aperçu du document original (12 premières lignes)</summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-charcoal-400">{sourcePreview}</pre>
        </details>}
      </section>

      {analysis && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="admin-card"><p className="text-xs text-charcoal-400">Lignes extraites</p><p className="mt-1 text-2xl font-bold text-offwhite">{analysis.rows.length}</p></div>
            <div className="admin-card"><p className="text-xs text-charcoal-400">Prêtes à vérifier</p><p className="mt-1 text-2xl font-bold text-emerald-400">{readyRows.length}</p></div>
            <div className="admin-card"><p className="text-xs text-charcoal-400">À corriger</p><p className="mt-1 text-2xl font-bold text-amber-300">{invalidRows.length}</p></div>
          </section>

          <section className="admin-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold text-offwhite">Vérifier les données extraites</h2><p className="mt-1 text-xs text-charcoal-400">Les champs en rouge doivent être corrigés. Aucun prix manquant n’est complété automatiquement.</p></div>
              <span className="rounded-full bg-charcoal-800 px-3 py-1 text-xs text-charcoal-300">{analysis.headers.length} colonnes détectées</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="border-b border-charcoal-400/15 text-xs text-charcoal-400">
                  <tr><th className="px-2 py-3">Matière</th><th className="px-2 py-3">Quantité</th><th className="px-2 py-3">Unité</th><th className="px-2 py-3">Prix unitaire (DA)</th><th className="px-2 py-3">Fournisseur</th><th className="px-2 py-3">État</th></tr>
                </thead>
                <tbody className="divide-y divide-charcoal-400/10">
                  {analysis.rows.map((row, index) => {
                    const issues = validateExtractedMaterial(row)
                    return <tr key={row.sourceRow}>
                      <td className="px-2 py-3"><input aria-label={`Matière ligne ${row.sourceRow}`} value={row.materialName} onChange={(event) => updateRow(index, { materialName: event.target.value })} className="input-field min-w-40 py-2" /></td>
                      <td className="px-2 py-3"><input aria-label={`Quantité ligne ${row.sourceRow}`} type="number" min="0" step="any" value={row.quantity} onChange={(event) => updateRow(index, { quantity: event.target.value })} className="input-field w-24 py-2" /></td>
                      <td className="px-2 py-3"><select aria-label={`Unité ligne ${row.sourceRow}`} value={row.unit} onChange={(event) => updateRow(index, { unit: event.target.value as ExtractedMaterial['unit'] })} className="input-field w-32 py-2"><option value="">À choisir</option>{Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                      <td className="px-2 py-3"><input aria-label={`Prix unitaire ligne ${row.sourceRow}`} type="number" min="1" step="1" value={row.unitPriceDzd} onChange={(event) => updateRow(index, { unitPriceDzd: event.target.value })} className="input-field w-32 py-2" /></td>
                      <td className="px-2 py-3"><input aria-label={`Fournisseur ligne ${row.sourceRow}`} value={row.supplier} onChange={(event) => updateRow(index, { supplier: event.target.value })} className="input-field min-w-32 py-2" /></td>
                      <td className="px-2 py-3">{issues.length === 0 ? <span className="text-xs text-emerald-400">Valide</span> : <span className="text-xs text-amber-300" title={issues.join(' · ')}>{issues.join(' · ')}</span>}</td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-charcoal-400/10 pt-4">
              <p className="text-xs text-charcoal-500">Les matières existantes sont ignorées : leurs prix ne seront jamais écrasés par cet import.</p>
              <button type="button" onClick={() => void importMaterials()} disabled={busy || readyRows.length === 0} className="btn-primary">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmer et ajouter {readyRows.length} matière(s)
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
