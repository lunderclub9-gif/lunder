import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, Paperclip, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validateCustomFile } from '@/lib/media'
import { normalizeAlgerianPhone, orderErrorMessage } from '@/lib/checkout'
import {
  calculateManufacturingQuote,
  type ManufacturingPricingRules,
} from '@/lib/manufacturing-pricing'
import { formatDzd } from '@/lib/format'

type UploadedFile = { path: string; name: string; mime: string; size: number; kind: 'image' | 'model' }
type CreatedRequest = { request_number: string; tracking_token: string }

export default function CustomRequestPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [intendedUse, setIntendedUse] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [unit, setUnit] = useState<'mm' | 'cm' | 'm'>('mm')
  const [material, setMaterial] = useState('')
  const [color, setColor] = useState('')
  const [quantity, setQuantity] = useState('1')

  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedRequest | null>(null)

  const [pricingRules, setPricingRules] = useState<ManufacturingPricingRules | null>(null)
  const [estimateMaterial, setEstimateMaterial] = useState('')
  const [estimateGrams, setEstimateGrams] = useState('')
  const [estimateHours, setEstimateHours] = useState('')
  const [estimateOptions, setEstimateOptions] = useState({
    design: false,
    modeling: false,
    assembly: false,
    finishing: false,
    painting: false,
  })
  const [estimateRush, setEstimateRush] = useState(false)

  const folder = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`
  )
  const idempotencyKey = useRef<string>(crypto.randomUUID())

  useEffect(() => {
    let active = true
    const load = async () => {
      const [{ data: mats }, { data: rules }] = await Promise.all([
        supabase
          .from('manufacturing_materials')
          .select('name, price_per_gram_dzd, multiplier, colors, is_available')
          .eq('is_available', true)
          .order('name'),
        supabase.from('manufacturing_pricing').select('*').eq('id', true).maybeSingle(),
      ])
      if (!active) return
      const materials = (mats ?? []).map((m: Record<string, unknown>) => ({
        name: String(m.name),
        pricePerGramDzd: Number(m.price_per_gram_dzd ?? 0),
        multiplier: Number(m.multiplier ?? 1),
        colors: (m.colors as string[]) ?? [],
        available: Boolean(m.is_available),
      }))
      const r = (rules ?? {}) as Record<string, unknown>
      const discountRaw = (r.quantity_discounts as { minQuantity?: number; min_quantity?: number; percent: number }[]) ?? []
      const discounts = discountRaw.map((t) => ({
        minQuantity: Number(t.minQuantity ?? t.min_quantity ?? 0),
        percent: Number(t.percent ?? 0),
      }))
      setPricingRules({
        materials,
        pricePerHourDzd: Number(r.price_per_hour_dzd ?? 0),
        machineHourlyCostDzd: Number(r.machine_hourly_cost_dzd ?? 0),
        electricityPerHourDzd: Number(r.electricity_per_hour_dzd ?? 0),
        minimumPrintChargeDzd: Number(r.minimum_print_charge_dzd ?? 0),
        extraProductionDzd: Number(r.extra_production_dzd ?? 0),
        designPreparationFeeDzd: Number(r.design_preparation_fee_dzd ?? 0),
        modelingFeeDzd: Number(r.modeling_fee_dzd ?? 0),
        assemblyFeeDzd: Number(r.assembly_fee_dzd ?? 0),
        finishingFeeDzd: Number(r.finishing_fee_dzd ?? 0),
        paintingFeeDzd: Number(r.painting_fee_dzd ?? 0),
        marginPercent: Number(r.margin_percent ?? 0),
        minimumOrderDzd: Number(r.minimum_order_dzd ?? 0),
        complexityFeeDzd: Number(r.complexity_fee_dzd ?? 0),
        wastePercent: Number(r.waste_percent ?? 0),
        quantityDiscounts: discounts,
        rushFeePercent: Number(r.rush_fee_percent ?? 0),
        validityDays: Number(r.validity_days ?? 14),
      })
      if (materials.length > 0) setEstimateMaterial(materials[0].name)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  let estimate: ReturnType<typeof calculateManufacturingQuote> | null = null
  let estimateError: string | null = null
  if (pricingRules && estimateMaterial && estimateGrams && estimateHours) {
    const grams = Number(estimateGrams)
    const hours = Number(estimateHours)
    const qty = Number(quantity) || 1
    if (Number.isFinite(grams) && grams > 0 && Number.isFinite(hours) && hours > 0) {
      try {
        estimate = calculateManufacturingQuote(pricingRules, {
          materialName: estimateMaterial,
          grams,
          printHours: hours,
          quantity: qty,
          rush: estimateRush,
          options: estimateOptions,
        })
      } catch (err) {
        estimateError = err instanceof Error ? err.message : 'Estimation impossible.'
      }
    }
  }

  const handleFiles = async (list: FileList | null, kind: 'image' | 'model') => {
    if (!list || list.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(list)) {
        if (files.length >= 10) throw new Error('Maximum 10 fichiers par demande.')
        const check = await validateCustomFile(file)
        if (!check.ok) throw new Error(check.message)
        const isModel = check.contentType.startsWith('model/')
        if (kind === 'image' && isModel) throw new Error(`« ${file.name} » n'est pas une photo.`)
        if (kind === 'model' && !isModel) throw new Error(`« ${file.name} » n'est pas un fichier 3D.`)

        const path = `${folder.current}/${Date.now()}-${files.length}.${check.extension}`
        const { error: uploadError } = await supabase.storage
          .from('custom-requests')
          .upload(path, file, { contentType: check.contentType, upsert: false })
        if (uploadError) throw new Error(`« ${file.name} » a été refusé (format ou taille).`)

        setFiles((current) => [
          ...current,
          { path, name: file.name, mime: check.contentType, size: file.size, kind },
        ])
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Échec du téléversement.')
    } finally {
      setUploading(false)
    }
  }

  const removeFile = async (path: string) => {
    await supabase.storage.from('custom-requests').remove([path])
    setFiles((current) => current.filter((file) => file.path !== path))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const normalized = normalizeAlgerianPhone(phone)
    if (!normalized) {
      setError('Numéro de téléphone algérien invalide (ex. 0550 12 34 56).')
      return
    }
    if (description.trim().length < 20) {
      setError('Décrivez votre projet en quelques phrases (20 caractères minimum).')
      return
    }

    setSubmitting(true)
    const { data, error: rpcError } = await supabase.rpc('create_custom_request', {
      p_payload: {
        idempotency_key: idempotencyKey.current,
        customer_name: name.trim(),
        phone: normalized,
        email: email.trim() || null,
        title: title.trim(),
        description: description.trim(),
        intended_use: intendedUse.trim() || null,
        dimensions: dimensions.trim() || null,
        dimension_unit: unit,
        material_preference: material.trim() || null,
        color_preference: color.trim() || null,
        quantity: Number(quantity) || 1,
        files: files.map((file) => ({
          path: file.path,
          name: file.name,
          mime: file.mime,
          size: file.size,
          kind: file.kind,
        })),
      },
    })
    setSubmitting(false)

    if (rpcError) {
      setError(
        orderErrorMessage(
          rpcError.message,
          "La demande n'a pas pu être enregistrée. Vérifiez vos informations."
        )
      )
      return
    }
    setCreated(data as CreatedRequest)
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <CheckCircle2 className="mb-4 h-8 w-8 text-green-500" />
        <h1 className="text-2xl font-bold text-offwhite">Demande envoyée</h1>
        <p className="mt-2 text-sm text-charcoal-300">
          Votre demande <span className="font-mono text-offwhite">{created.request_number}</span> a
          bien été enregistrée. Nous vérifions la faisabilité avant de vous transmettre un devis.
        </p>
        <p className="mt-2 text-sm text-charcoal-300">
          Conservez ce lien pour suivre votre demande et consulter vos devis.
        </p>
        <Link
          to={`/boutique/sur-mesure/suivi?token=${created.tracking_token}`}
          className="btn-primary mt-6"
        >
          Suivre ma demande
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold text-offwhite">Demande sur mesure</h1>
      <p className="mt-2 text-sm text-charcoal-400">
        Décrivez la pièce à fabriquer. Nous étudions la faisabilité puis vous recevons un devis
        détaillé, valable pour une durée limitée.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="admin-card">
          <h2 className="mb-4 text-lg font-semibold text-offwhite">Votre projet</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label-text">Titre de la demande *</span>
              <input
                type="text"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="input-field"
                placeholder="Ex: Support mural pour casques"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="label-text">Description *</span>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="input-field resize-none"
                placeholder="Forme, fonction, contraintes, finition attendue..."
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="label-text">Usage prévu</span>
              <input
                type="text"
                value={intendedUse}
                onChange={(event) => setIntendedUse(event.target.value)}
                className="input-field"
                placeholder="Ex: intérieur, pièce mécanique, décoration"
              />
            </label>
            <label className="block">
              <span className="label-text">Dimensions</span>
              <input
                type="text"
                value={dimensions}
                onChange={(event) => setDimensions(event.target.value)}
                className="input-field"
                placeholder="Ex: 120 x 40 x 30"
              />
            </label>
            <label className="block">
              <span className="label-text">Unité</span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value as 'mm' | 'cm' | 'm')}
                className="input-field"
              >
                <option value="mm">millimètres</option>
                <option value="cm">centimètres</option>
                <option value="m">mètres</option>
              </select>
            </label>
            <label className="block">
              <span className="label-text">Matière souhaitée</span>
              <input
                type="text"
                value={material}
                onChange={(event) => setMaterial(event.target.value)}
                className="input-field"
                placeholder="PLA, PETG..."
              />
            </label>
            <label className="block">
              <span className="label-text">Couleur souhaitée</span>
              <input
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="label-text">Quantité *</span>
              <input
                type="number"
                min={1}
                max={500}
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="input-field"
              />
            </label>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="mb-2 text-lg font-semibold text-offwhite">Estimation automatique (indicative)</h2>
          <p className="mb-4 text-xs text-charcoal-400">
            Le poids de matière et le temps d'impression sont des estimations de production, pas des
            mesures garanties. Le prix ferme est confirmé par le studio après réception du fichier ou
            des dimensions définitives. Les frais de livraison sont calculés séparément.
          </p>
          {pricingRules ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="label-text">Matière</span>
                  <select
                    value={estimateMaterial}
                    onChange={(event) => setEstimateMaterial(event.target.value)}
                    className="input-field"
                  >
                    {pricingRules.materials.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label-text">Poids estimé (g)</span>
                  <input
                    type="number"
                    min={0}
                    value={estimateGrams}
                    onChange={(event) => setEstimateGrams(event.target.value)}
                    className="input-field"
                    placeholder="ex. 120"
                  />
                </label>
                <label className="block">
                  <span className="label-text">Temps d'impression (h)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={estimateHours}
                    onChange={(event) => setEstimateHours(event.target.value)}
                    className="input-field"
                    placeholder="ex. 2.5"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-charcoal-300">
                {(
                  [
                    ['design', 'Préparation du design'],
                    ['modeling', 'Modélisation / modification'],
                    ['assembly', 'Assemblage'],
                    ['finishing', 'Ponçage et finition'],
                    ['painting', 'Peinture'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={estimateOptions[key]}
                      onChange={(event) =>
                        setEstimateOptions((current) => ({ ...current, [key]: event.target.checked }))
                      }
                      className="h-3.5 w-3.5 accent-brand-red"
                    />
                    {label}
                  </label>
                ))}
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={estimateRush}
                    onChange={(event) => setEstimateRush(event.target.checked)}
                    className="h-3.5 w-3.5 accent-brand-red"
                  />
                  Urgence
                </label>
              </div>
              {estimateError && (
                <p className="text-xs text-brand-red-light">{estimateError}</p>
              )}
              {estimate && (
                <div className="rounded-lg border border-charcoal-400/15 p-3">
                  <ul className="space-y-1 text-sm">
                    {estimate.lines.map((line, index) => (
                      <li key={index} className="flex justify-between gap-3 text-charcoal-300">
                        <span>
                          {line.label}
                          {line.detail ? (
                            <span className="ml-2 text-xs text-charcoal-500">{line.detail}</span>
                          ) : null}
                        </span>
                        <span>{formatDzd(line.amountDzd)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t border-charcoal-400/15 pt-2 text-sm font-semibold text-offwhite">
                    <span>Total estimé ({estimate.quantity} pièce(s))</span>
                    <span>{formatDzd(estimate.totalDzd)}</span>
                  </div>
                  <p className="mt-2 text-xs text-charcoal-500">
                    Estimation indicative — géométrie non vérifiée. Le prix ferme est confirmé par le
                    studio.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-charcoal-400">Tarification non configurée.</p>
          )}
        </div>

        <div className="admin-card">
          <h2 className="mb-2 text-lg font-semibold text-offwhite">Fichiers</h2>
          <p className="mb-4 text-xs text-charcoal-400">
            Photos et fichiers 3D sont stockés dans un espace privé, accessibles uniquement au
            studio. Formats acceptés : JPG, PNG, WebP, AVIF (5 Mo), GLB, GLTF, STL, OBJ (25 Mo).
            Seul le GLB/GLTF peut être prévisualisé dans le navigateur ; STL et OBJ sont étudiés par
            le studio sans aperçu en ligne.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="btn-secondary cursor-pointer justify-center">
              <Upload className="h-4 w-4" />
              Ajouter des photos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="hidden"
                onChange={(event) => handleFiles(event.target.files, 'image')}
              />
            </label>
            <label className="btn-secondary cursor-pointer justify-center">
              <Paperclip className="h-4 w-4" />
              Ajouter un fichier 3D
              <input
                type="file"
                accept=".glb,.gltf,.stl,.obj"
                multiple
                className="hidden"
                onChange={(event) => handleFiles(event.target.files, 'model')}
              />
            </label>
          </div>

          {uploading && (
            <p className="mt-3 flex items-center gap-2 text-xs text-charcoal-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Téléversement en cours…
            </p>
          )}

          {files.length > 0 && (
            <ul className="mt-4 space-y-2">
              {files.map((file) => (
                <li
                  key={file.path}
                  className="flex items-center justify-between gap-2 rounded-lg border border-charcoal-400/15 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-charcoal-200">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.path)}
                    className="text-charcoal-400 hover:text-brand-red"
                    aria-label={`Retirer ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-card">
          <h2 className="mb-4 text-lg font-semibold text-offwhite">Vos coordonnées</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label-text">Nom et prénom *</span>
              <input
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="input-field"
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="label-text">Téléphone *</span>
              <input
                type="tel"
                required
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="input-field"
                placeholder="0550 12 34 56"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="label-text">Email (optionnel)</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input-field"
              />
            </label>
          </div>
        </div>

        <button type="submit" disabled={submitting || uploading} className="btn-primary w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer ma demande'}
        </button>
      </form>
    </div>
  )
}
