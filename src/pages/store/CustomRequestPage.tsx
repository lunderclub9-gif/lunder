import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, Paperclip, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validateCustomFile } from '@/lib/media'
import { DELIVERY_METHOD_LABELS, normalizeAlgerianPhone, orderErrorMessage } from '@/lib/checkout'
import { formatDzd } from '@/lib/format'

type UploadedFile = { path: string; name: string; mime: string; size: number; kind: 'image' | 'model' }
type CreatedRequest = { request_number: string; tracking_token: string }
type Material = { name: string; colors: string[] }
type Wilaya = { code: number; name_fr: string }
type Commune = { id: string; name_fr: string }
type PickupPoint = { id: string; name: string; address: string | null }

type Estimate = {
  lines: { label: string; amountDzd: number; detail?: string | null }[]
  totalDzd: number
  quantity: number
  discountPercent?: number
  discountDzd?: number
  rushFeeDzd?: number
  assumptions?: string[]
  estimates?: { grams?: number; printHours?: number; method?: string }
}

export default function CustomRequestPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [intendedUse, setIntendedUse] = useState('')
  const [lengthMm, setLengthMm] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [heightMm, setHeightMm] = useState('')
  const [material, setMaterial] = useState('')
  const [color, setColor] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [options, setOptions] = useState({
    design: false,
    modeling: false,
    assembly: false,
    finishing: false,
    painting: false,
  })
  const [rush, setRush] = useState(false)

  const [materials, setMaterials] = useState<Material[]>([])
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [estimateAccepted, setEstimateAccepted] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([])
  const [wilayaCode, setWilayaCode] = useState('')
  const [communeId, setCommuneId] = useState('')
  const [method, setMethod] = useState<'domicile' | 'stopdesk'>('domicile')
  const [address, setAddress] = useState('')
  const [pickupId, setPickupId] = useState('')

  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedRequest | null>(null)

  const folder = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`
  )
  const idempotencyKey = useRef<string>(crypto.randomUUID())

  useEffect(() => {
    let active = true
    supabase
      .from('manufacturing_materials_public')
      .select('name, colors')
      .order('name')
      .then(({ data }) => {
        if (!active) return
        const mats = (data ?? []).map((m: Record<string, unknown>) => ({
          name: String(m.name),
          colors: (m.colors as string[]) ?? [],
        }))
        setMaterials(mats)
        if (mats.length > 0) setMaterial((current) => current || mats[0].name)
      })
    supabase
      .from('wilayas')
      .select('code, name_fr')
      .eq('is_active', true)
      .order('code')
      .then(({ data }) => {
        if (active) setWilayas((data as Wilaya[]) ?? [])
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setCommuneId('')
    setPickupPoints([])
    setPickupId('')
    if (!wilayaCode) return
    supabase
      .from('communes')
      .select('id, name_fr')
      .eq('wilaya_code', Number(wilayaCode))
      .eq('is_active', true)
      .order('name_fr')
      .then(({ data }) => setCommunes((data as Commune[]) ?? []))
    supabase
      .from('pickup_points')
      .select('id, name, address')
      .eq('wilaya_code', Number(wilayaCode))
      .eq('is_active', true)
      .then(({ data }) => setPickupPoints((data as PickupPoint[]) ?? []))
  }, [wilayaCode])

  const runEstimate = useCallback(async () => {
    const l = Number(lengthMm)
    const w = Number(widthMm)
    const h = Number(heightMm)
    const qty = Number(quantity) || 1
    if (!material || !Number.isFinite(l) || l <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      setEstimate(null)
      setEstimateError(null)
      return
    }
    setEstimateLoading(true)
    setEstimateError(null)
    const { data, error: rpcError } = await supabase.rpc('estimate_manufacturing_dimensions', {
      p_length_mm: l,
      p_width_mm: w,
      p_height_mm: h,
      p_material_name: material,
      p_quantity: qty,
      p_options: options,
      p_rush: rush,
    })
    setEstimateLoading(false)
    if (rpcError || !data) {
      setEstimate(null)
      setEstimateError(orderErrorMessage(rpcError?.message, 'Estimation impossible pour ces dimensions.'))
      return
    }
    const d = data as Record<string, unknown>
    setEstimate({
      lines: (d.lines as Estimate['lines']) ?? [],
      totalDzd: Number(d.totalDzd ?? 0),
      quantity: Number(d.quantity ?? qty),
      discountPercent: Number(d.discountPercent ?? 0),
      discountDzd: Number(d.discountDzd ?? 0),
      rushFeeDzd: Number(d.rushFeeDzd ?? 0),
      assumptions: (d.assumptions as string[]) ?? [],
      estimates: d.estimates as Estimate['estimates'],
    })
  }, [lengthMm, widthMm, heightMm, material, quantity, options, rush])

  useEffect(() => {
    const timer = setTimeout(() => {
      void runEstimate()
    }, 450)
    return () => clearTimeout(timer)
  }, [runEstimate])

  // Toute modification des paramètres invalide l'acceptation précédente : le
  // client doit accepter le nouveau montant estimé.
  useEffect(() => {
    setEstimateAccepted(false)
  }, [lengthMm, widthMm, heightMm, material, quantity, options, rush])

  const acceptEstimate = () => {
    setError(null)
    if (estimateLoading) return
    if (!estimate) {
      setError('Renseignez les dimensions et la matière pour obtenir une estimation.')
      return
    }
    setEstimateAccepted(true)
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

    if (!estimateAccepted || !estimate) {
      setError('Acceptez d’abord l’estimation affichée pour continuer.')
      return
    }
    const normalized = normalizeAlgerianPhone(phone)
    if (!normalized) {
      setError('Numéro de téléphone algérien invalide (ex. 0550 12 34 56).')
      return
    }
    if (!name.trim()) {
      setError('Le nom et prénom sont requis.')
      return
    }
    if (description.trim().length < 20) {
      setError('Décrivez votre projet en quelques phrases (20 caractères minimum).')
      return
    }
    if (!wilayaCode || !communeId) {
      setError('Sélectionnez votre wilaya et votre commune.')
      return
    }
    if (method === 'domicile' && !address.trim()) {
      setError("L'adresse de livraison est requise.")
      return
    }
    if (method === 'stopdesk' && !pickupId) {
      setError('Sélectionnez un point relais.')
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
        dimensions: `${lengthMm} x ${widthMm} x ${heightMm}`,
        dimension_unit: 'mm',
        dim_length_mm: Number(lengthMm),
        dim_width_mm: Number(widthMm),
        dim_height_mm: Number(heightMm),
        material_preference: material,
        color_preference: color.trim() || null,
        quantity: Number(quantity) || 1,
        manufacturing_options: options,
        rush,
        estimate_accepted: true,
        delivery: {
          wilaya_code: Number(wilayaCode),
          commune_id: communeId,
          method,
          address: method === 'domicile' ? address.trim() : null,
          pickup_point_id: method === 'stopdesk' ? pickupId : null,
        },
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
          bien été enregistrée avec votre acceptation de l’estimation. Le studio doit maintenant
          vérifier le fichier et approuver la fabrication avant toute création de commande.
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
        Décrivez la pièce, indiquez ses dimensions : le prix est estimé automatiquement. Vous
        acceptez ensuite l’estimation, puis vous complétez vos coordonnées et votre livraison. Le
        studio doit approuver la fabrication avant la création de la commande.
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
          </div>
        </div>

        <div className="admin-card">
          <h2 className="mb-2 text-lg font-semibold text-offwhite">Dimensions et matière</h2>
          <p className="mb-4 text-xs text-charcoal-400">
            Les trois dimensions sont nécessaires à l’estimation. Le poids et le temps sont déduits
            automatiquement de la boîte englobante, de la matière et des hypothèses du studio : ce
            sont des estimations, pas des mesures issues du fichier 3D.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['Longueur (mm) *', lengthMm, setLengthMm],
                ['Largeur (mm) *', widthMm, setWidthMm],
                ['Hauteur (mm) *', heightMm, setHeightMm],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="block">
                <span className="label-text">{label}</span>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  required
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className="input-field"
                  placeholder="ex. 120"
                />
              </label>
            ))}
            <label className="block">
              <span className="label-text">Matière *</span>
              <select
                required
                value={material}
                onChange={(event) => setMaterial(event.target.value)}
                className="input-field"
                disabled={materials.length === 0}
              >
                {materials.length === 0 ? (
                  <option value="">Tarification non configurée</option>
                ) : (
                  materials.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="block">
              <span className="label-text">Couleur souhaitée</span>
              <input
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="input-field"
                placeholder="Ex: Noir"
                list="custom-colors"
              />
              <datalist id="custom-colors">
                {(materials.find((m) => m.name === material)?.colors ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="label-text">Quantité *</span>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="input-field"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-charcoal-300">
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
                  checked={options[key]}
                  onChange={(event) =>
                    setOptions((current) => ({ ...current, [key]: event.target.checked }))
                  }
                  className="h-3.5 w-3.5 accent-brand-red"
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={rush}
                onChange={(event) => setRush(event.target.checked)}
                className="h-3.5 w-3.5 accent-brand-red"
              />
              Production urgente
            </label>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="mb-2 text-lg font-semibold text-offwhite">Estimation automatique</h2>
          <p className="mb-4 text-xs text-charcoal-400">
            Estimation indicative calculée à partir de vos dimensions. Elle ne constitue pas un
            devis ferme : le propriétaire vérifie la faisabilité et peut ajuster le prix.
          </p>
          {estimateLoading && <p className="text-xs text-charcoal-300">Calcul de l’estimation…</p>}
          {estimateError && <p className="text-xs text-brand-red-light">{estimateError}</p>}
          {estimate ? (
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
              {estimate.estimates && (
                <p className="mt-2 text-xs text-charcoal-500">
                  Estimation de production : environ {estimate.estimates.grams ?? '—'} g et{' '}
                  {estimate.estimates.printHours ?? '—'} h — non vérifié sur le fichier 3D.
                </p>
              )}
              <p className="mt-2 text-xs text-charcoal-500">
                Estimation indicative, sous réserve de validation du propriétaire. Les frais de
                livraison sont calculés séparément.
              </p>
              {!estimateAccepted ? (
                <button
                  type="button"
                  onClick={acceptEstimate}
                  disabled={estimateLoading}
                  className="btn-primary mt-3"
                >
                  J’accepte cette estimation
                </button>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> Estimation acceptée. Complétez vos
                  coordonnées et votre livraison.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-charcoal-400">
              Renseignez les trois dimensions, la matière et la quantité pour obtenir une estimation.
            </p>
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

        {estimateAccepted && (
          <>
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
                  <span className="label-text">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="input-field"
                    autoComplete="email"
                  />
                </label>
              </div>
            </div>

            <div className="admin-card">
              <h2 className="mb-4 text-lg font-semibold text-offwhite">Livraison</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label-text">Wilaya *</span>
                  <select
                    required
                    value={wilayaCode}
                    onChange={(event) => setWilayaCode(event.target.value)}
                    className="input-field"
                  >
                    <option value="">Sélectionner...</option>
                    {wilayas.map((w) => (
                      <option key={w.code} value={w.code}>
                        {String(w.code).padStart(2, '0')} — {w.name_fr}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label-text">Commune *</span>
                  <select
                    required
                    value={communeId}
                    onChange={(event) => setCommuneId(event.target.value)}
                    className="input-field"
                    disabled={!wilayaCode}
                  >
                    <option value="">Sélectionner...</option>
                    {communes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_fr}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(['domicile', 'stopdesk'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setMethod(option)
                      setPickupId('')
                    }}
                    aria-pressed={method === option}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      method === option
                        ? 'border-brand-red bg-brand-red/10 text-brand-red-light'
                        : 'border-charcoal-400/20 text-charcoal-300 hover:border-charcoal-300'
                    }`}
                  >
                    {DELIVERY_METHOD_LABELS[option]}
                  </button>
                ))}
              </div>

              {method === 'domicile' ? (
                <label className="mt-3 block">
                  <span className="label-text">Adresse de livraison *</span>
                  <textarea
                    rows={2}
                    required
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="input-field resize-none"
                  />
                </label>
              ) : (
                <label className="mt-3 block">
                  <span className="label-text">Point relais *</span>
                  <select
                    required
                    value={pickupId}
                    onChange={(event) => setPickupId(event.target.value)}
                    className="input-field"
                    disabled={pickupPoints.length === 0}
                  >
                    <option value="">
                      {pickupPoints.length === 0
                        ? 'Aucun point relais dans cette wilaya'
                        : 'Sélectionner...'}
                    </option>
                    {pickupPoints.map((point) => (
                      <option key={point.id} value={point.id}>
                        {point.name}
                        {point.address ? ` — ${point.address}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <button type="submit" disabled={submitting || uploading} className="btn-primary w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer ma demande complète'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
