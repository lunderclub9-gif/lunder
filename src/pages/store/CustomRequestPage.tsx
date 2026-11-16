import { createElement, useCallback, useEffect, useRef, useState, type ElementType } from 'react'
import '@google/model-viewer'
import JsBarcode from 'jsbarcode'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Download, Loader2, Paperclip, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validateCustomFile } from '@/lib/media'
import { DELIVERY_METHOD_LABELS, normalizeAlgerianPhone, orderErrorMessage } from '@/lib/checkout'
import { formatDzd } from '@/lib/format'
import { downloadTicketImage } from '@/lib/ticketImage'
import { analyze3DModel, type ModelAnalysis } from '@/lib/model-analysis'

type UploadedFile = { path: string; name: string; mime: string; size: number; kind: 'image' | 'model' }
type ProductSpec = {
  id: string
  filePath: string
  fileName: string
  previewUrl: string | null
  mode: 'reference' | 'exact' | 'modify' | 'inspiration'
  original: ModelAnalysis['dimensionsMm']
  target: ModelAnalysis['dimensionsMm']
  analysis: ModelAnalysis
  preserveRatio: boolean
  quantity: number
  material: string
  color: string
  instructions: string
}
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
  const [productSpecs, setProductSpecs] = useState<ProductSpec[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedRequest | null>(null)
  const ticketBarcodeRef = useRef<SVGSVGElement>(null)

  const folder = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`
  )
  const uploadLock = useRef(false)
  const estimateSequence = useRef(0)
  const previewUrls = useRef(new Set<string>())
  const idempotencyKey = useRef<string>(crypto.randomUUID())

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current.clear()
  }, [])

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
        if (mats.length > 0) {
          setMaterial((current) => current || mats[0].name)
          setProductSpecs((current) => current.map((product) => product.material ? product : { ...product, material: mats[0].name }))
        }
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
    const sequence = ++estimateSequence.current
    const activeProducts = productSpecs
    const modelFileCount = files.filter((file) => file.kind === 'model').length
    if (modelFileCount !== activeProducts.length) {
      setEstimate(null)
      setEstimateError('Un ou plusieurs fichiers 3D n’ont pas pu être analysés. Retirez le fichier concerné ou réexportez-le en GLB autonome, STL ou OBJ valide pour éviter une estimation incomplète.')
      setEstimateLoading(false)
      return
    }
    const fallback = {
      length: Number(lengthMm), width: Number(widthMm), height: Number(heightMm),
      quantity: Number(quantity) || 1, material,
    }
    if (!activeProducts.length && (!fallback.material || !Number.isFinite(fallback.length) || fallback.length <= 0 || !Number.isFinite(fallback.width) || fallback.width <= 0 || !Number.isFinite(fallback.height) || fallback.height <= 0)) {
      setEstimate(null)
      setEstimateError(null)
      setEstimateLoading(false)
      return
    }
    if (activeProducts.reduce((sum, product) => sum + product.quantity, 0) > 500) {
      setEstimate(null)
      setEstimateError('La quantité totale ne peut pas dépasser 500 pièces par demande.')
      setEstimateLoading(false)
      return
    }
    if (activeProducts.some((product) => !product.material || Object.values(product.target).some((value) => !Number.isFinite(value) || value <= 0 || value > 2000))) {
      setEstimate(null)
      setEstimateError('Vérifiez les dimensions et la matière de chaque modèle.')
      setEstimateLoading(false)
      return
    }
    setEstimateLoading(true)
    setEstimateError(null)
    const effectiveOptions = {
      ...options,
      modeling: options.modeling || activeProducts.some((product) => product.mode === 'modify' || product.mode === 'inspiration'),
      design: options.design || activeProducts.some((product) => product.mode === 'inspiration'),
    }
    const inputs = activeProducts.length ? activeProducts.map((product) => ({
      length: product.target.length, width: product.target.width, height: product.target.height,
      quantity: product.quantity, material: product.material,
    })) : [fallback]
    try {
      const results = await Promise.all(inputs.map((item, index) => activeProducts.length
      ? supabase.rpc('estimate_manufacturing_model', {
          p_length_mm: item.length, p_width_mm: item.width, p_height_mm: item.height,
          p_mesh_volume_cm3: ['reference', 'exact'].includes(activeProducts[index].mode) && activeProducts[index].analysis.meshVolumeCm3 !== null
            ? activeProducts[index].analysis.meshVolumeCm3! * (item.length * item.width * item.height) / (activeProducts[index].original.length * activeProducts[index].original.width * activeProducts[index].original.height)
            : null,
          p_material_name: item.material, p_quantity: item.quantity, p_options: effectiveOptions, p_rush: rush,
        })
      : supabase.rpc('estimate_manufacturing_dimensions', {
          p_length_mm: item.length, p_width_mm: item.width, p_height_mm: item.height,
          p_material_name: item.material, p_quantity: item.quantity, p_options: effectiveOptions, p_rush: rush,
        })
    ))
    if (sequence !== estimateSequence.current) return
    setEstimateLoading(false)
    const failed = results.find((result) => result.error || !result.data)
    if (failed) {
      setEstimate(null)
      setEstimateError(orderErrorMessage(failed.error?.message, 'Estimation impossible pour un ou plusieurs modèles.'))
      return
    }
    const rows = results.map((result) => result.data as Record<string, unknown>)
    const totalQuantity = inputs.reduce((sum, item) => sum + item.quantity, 0)
    const lines = rows.flatMap((row, index) => [
      ...(activeProducts.length ? [{ label: activeProducts[index].fileName, amountDzd: 0, detail: `Produit ${index + 1} · ${inputs[index].quantity} pièce(s)` }] : []),
      ...(((row.lines as Estimate['lines']) ?? []).map((line) => ({ ...line, label: activeProducts.length ? `${activeProducts[index].fileName} — ${line.label}` : line.label }))),
    ])
    setEstimate({
      lines,
      totalDzd: rows.reduce((sum, row) => sum + Number(row.totalDzd ?? 0), 0),
      quantity: totalQuantity,
      discountPercent: 0,
      discountDzd: rows.reduce((sum, row) => sum + Number(row.discountDzd ?? 0), 0),
      rushFeeDzd: rows.reduce((sum, row) => sum + Number(row.rushFeeDzd ?? 0), 0),
      assumptions: [...new Set(rows.flatMap((row) => (row.assumptions as string[]) ?? []))],
      estimates: {
        grams: rows.reduce((sum, row, index) => sum + Number((row.estimates as Record<string, unknown> | undefined)?.grams ?? 0) * inputs[index].quantity, 0),
        printHours: Math.round(rows.reduce((sum, row, index) => sum + Number((row.estimates as Record<string, unknown> | undefined)?.printHours ?? 0) * inputs[index].quantity, 0) * 10) / 10,
        method: activeProducts.length ? 'multiple_model_geometry_or_bounding_box_estimates' : String((rows[0].estimates as Record<string, unknown> | undefined)?.method ?? ''),
      },
      })
    } catch (estimateFailure) {
      if (sequence !== estimateSequence.current) return
      setEstimateLoading(false)
      setEstimate(null)
      setEstimateError(estimateFailure instanceof Error ? estimateFailure.message : 'Impossible de contacter le service de calcul. Réessayez.')
    }
  }, [lengthMm, widthMm, heightMm, material, quantity, options, rush, productSpecs, files])

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
  }, [lengthMm, widthMm, heightMm, material, quantity, options, rush, productSpecs])

  const invalidateEstimate = () => {
    estimateSequence.current += 1
    setEstimateLoading(false)
    setEstimateAccepted(false)
    setEstimate(null)
    setEstimateError(null)
  }

  const updateProduct = (id: string, patch: Partial<ProductSpec>) => {
    invalidateEstimate()
    setProductSpecs((current) => current.map((product) => product.id === id ? { ...product, ...patch } : product))
  }

  const updateProductDimension = (product: ProductSpec, axis: keyof ProductSpec['target'], rawValue: string) => {
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value <= 0) {
      updateProduct(product.id, { target: { ...product.target, [axis]: 0 } })
      return
    }
    if (!product.preserveRatio) {
      updateProduct(product.id, { target: { ...product.target, [axis]: value } })
      return
    }
    const ratio = value / product.original[axis]
    updateProduct(product.id, { target: {
      length: Math.round(product.original.length * ratio * 100) / 100,
      width: Math.round(product.original.width * ratio * 100) / 100,
      height: Math.round(product.original.height * ratio * 100) / 100,
    } })
  }

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
    if (!list || list.length === 0 || uploadLock.current) return
    uploadLock.current = true
    setError(null)
    setUploading(true)
    let uploadedCount = files.length
    try {
      for (const file of Array.from(list)) {
        if (uploadedCount >= 10) throw new Error('Maximum 10 fichiers par demande.')
        const check = await validateCustomFile(file)
        if (!check.ok) throw new Error(check.message)
        const isModel = check.contentType.startsWith('model/')
        if (kind === 'image' && isModel) throw new Error(`« ${file.name} » n'est pas une photo.`)
        if (kind === 'model' && !isModel) throw new Error(`« ${file.name} » n'est pas un fichier 3D.`)

        const path = `${folder.current}/${Date.now()}-${uploadedCount}.${check.extension}`
        let modelAnalysis: ModelAnalysis | null = null
        if (isModel) {
          try { modelAnalysis = await analyze3DModel(file) } catch (analysisError) {
            setError(analysisError instanceof Error ? `Fichier ajouté, mais analyse impossible : ${analysisError.message}` : 'Fichier ajouté, mais analyse géométrique indisponible.')
          }
        }
        const { error: uploadError } = await supabase.storage
          .from('custom-requests')
          .upload(path, file, { contentType: check.contentType, upsert: false })
        if (uploadError) throw new Error(`« ${file.name} » a été refusé (format ou taille).`)

        setFiles((current) => [
          ...current,
          { path, name: file.name, mime: check.contentType, size: file.size, kind },
        ])
        if (isModel && modelAnalysis) {
          invalidateEstimate()
          const id = `${Date.now()}-${uploadedCount}`
          const previewUrl = ['glb', 'gltf'].includes(modelAnalysis.format) ? URL.createObjectURL(file) : null
          if (previewUrl) previewUrls.current.add(previewUrl)
          setProductSpecs((current) => [...current, {
            id, filePath: path, fileName: file.name, previewUrl, mode: 'reference',
            original: modelAnalysis!.dimensionsMm, target: { ...modelAnalysis!.dimensionsMm },
            analysis: modelAnalysis!, preserveRatio: true, quantity: 1,
            material: material || materials[0]?.name || '', color, instructions: '',
          }])
          if (uploadedCount === 0 && !lengthMm && !widthMm && !heightMm) {
            setLengthMm(String(Math.round(modelAnalysis.dimensionsMm.length)))
            setWidthMm(String(Math.round(modelAnalysis.dimensionsMm.width)))
            setHeightMm(String(Math.round(modelAnalysis.dimensionsMm.height)))
          }
        }
        uploadedCount += 1
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Échec du téléversement.')
    } finally {
      uploadLock.current = false
      setUploading(false)
    }
  }

  const removeFile = async (path: string) => {
    if (uploadLock.current) return
    invalidateEstimate()
    setError(null)
    const productToRemove = productSpecs.find((product) => product.filePath === path)
    const { error: removeError } = await supabase.storage.from('custom-requests').remove([path])
    if (removeError) {
      setError('Impossible de supprimer ce fichier du stockage privé. Réessayez avant d’envoyer la demande.')
      return
    }
    if (productToRemove?.previewUrl) {
      URL.revokeObjectURL(productToRemove.previewUrl)
      previewUrls.current.delete(productToRemove.previewUrl)
    }
    setFiles((current) => current.filter((file) => file.path !== path))
    setProductSpecs((current) => current.filter((product) => product.filePath !== path))
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

    const pricingOptions = {
      ...options,
      modeling: options.modeling || productSpecs.some((product) => product.mode === 'modify' || product.mode === 'inspiration'),
      design: options.design || productSpecs.some((product) => product.mode === 'inspiration'),
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
        dimensions: productSpecs.length ? productSpecs.map((p) => `${p.fileName}: ${p.target.length} x ${p.target.width} x ${p.target.height} mm`).join(' | ') : `${lengthMm} x ${widthMm} x ${heightMm}`,
        dimension_unit: 'mm',
        dim_length_mm: productSpecs.length ? null : Number(lengthMm),
        dim_width_mm: productSpecs.length ? null : Number(widthMm),
        dim_height_mm: productSpecs.length ? null : Number(heightMm),
        material_preference: productSpecs.length ? null : material,
        color_preference: color.trim() || null,
        quantity: productSpecs.length ? productSpecs.reduce((sum, product) => sum + product.quantity, 0) : Number(quantity) || 1,
        product_specs: productSpecs.map((product) => ({
          id: product.id, file_path: product.filePath, file_name: product.fileName,
          mode: product.mode, original_dimensions_mm: product.original,
          target_dimensions_mm: product.target, quantity: product.quantity,
          material_name: product.material, color: product.color,
          preserve_ratio: product.preserveRatio,
          instructions: product.instructions,
          geometry: {
            format: product.analysis.format, mesh_volume_cm3: product.analysis.meshVolumeCm3,
            bounding_box_volume_cm3: product.analysis.boundingBoxVolumeCm3,
            triangle_count: product.analysis.triangleCount, vertex_count: product.analysis.vertexCount,
            component_count: product.analysis.componentCount,
            warnings: product.analysis.warnings,
          },
        })),
        manufacturing_options: pricingOptions,
        rush,
        estimate_accepted: productSpecs.length === 0,
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
    const createdRequest = data as CreatedRequest
    if (productSpecs.length > 0) {
      setSubmitting(true)
      const { data: savedProducts, error: productSaveError } = await supabase.rpc('save_custom_request_products', {
        p_tracking_token: createdRequest.tracking_token,
        p_products: productSpecs.map((product) => ({
          id: product.id, file_path: product.filePath, file_name: product.fileName,
          mode: product.mode, original_dimensions_mm: product.original,
          target_dimensions_mm: product.target, quantity: product.quantity,
          material_name: product.material, color: product.color,
          preserve_ratio: product.preserveRatio,
          geometry: {
            format: product.analysis.format, mesh_volume_cm3: product.analysis.meshVolumeCm3,
            bounding_box_volume_cm3: product.analysis.boundingBoxVolumeCm3,
            triangle_count: product.analysis.triangleCount, vertex_count: product.analysis.vertexCount,
            component_count: product.analysis.componentCount,
            warnings: product.analysis.warnings,
          },
        })),
        p_options: pricingOptions,
        p_rush: rush,
      })
      setSubmitting(false)
      if (productSaveError || !savedProducts) {
        setError(orderErrorMessage(productSaveError?.message, 'La demande est créée, mais les détails des modèles n’ont pas pu être enregistrés. Réessayez pour terminer leur enregistrement.'))
        return
      }
      const saved = savedProducts as Record<string, unknown>
      setEstimate((current) => current ? { ...current, totalDzd: Number(saved.totalDzd ?? current.totalDzd) } : current)
    }
    setCreated(createdRequest)
  }

  useEffect(() => {
    if (!created || !ticketBarcodeRef.current) return
    try {
      JsBarcode(ticketBarcodeRef.current, created.request_number, {
        format: 'CODE128', lineColor: '#111827', width: 1.4, height: 48,
        displayValue: false, margin: 4, background: '#ffffff',
      })
    } catch {
      ticketBarcodeRef.current.innerHTML = ''
    }
  }, [created])

  if (created) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <div className="customer-request-ticket rounded-xl border border-charcoal-400/20 bg-white p-5 text-slate-900 shadow-sm">
          <div className="text-center">
            <p className="text-lg font-black tracking-widest">LUNDER 3D</p>
            <p className="mt-1 text-xs text-slate-500">TICKET DE DEMANDE SUR MESURE</p>
            <p className="mt-3 text-sm font-semibold text-green-700">Demande bien enregistrée</p>
          </div>
          <div className="my-4 border-t border-dashed border-slate-300" />
          <p className="text-xs text-slate-500">NUMÉRO DE DEMANDE</p>
          <p className="mt-1 break-all font-mono text-2xl font-bold">{created.request_number}</p>
          <p className="mt-3 text-xs text-slate-500">TÉLÉPHONE</p>
          <p className="mt-1 text-lg font-semibold">{normalizeAlgerianPhone(phone) ?? phone}</p>
          <div className="mt-4 flex justify-center rounded-lg bg-white p-2"><svg ref={ticketBarcodeRef} role="img" aria-label={`Code-barres de la demande ${created.request_number}`} /></div>
          <p className="text-center font-mono text-xs text-slate-500">{created.request_number}</p>
          <p className="mt-4 text-center text-xs text-slate-500">Gardez ce ticket pour retrouver et suivre votre demande.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
<button type="button" onClick={() => void downloadTicketImage({ kind: 'DEMANDE SUR MESURE', number: created.request_number, phone: normalizeAlgerianPhone(phone) ?? phone, barcodeSvg: ticketBarcodeRef.current?.outerHTML })} className="btn-primary"><Download className="h-4 w-4" /> Télécharger le ticket (image PNG)</button>
            <Link to={`/boutique/sur-mesure/suivi?token=${created.tracking_token}`} className="btn-secondary">Suivre ma demande</Link>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-charcoal-400">Le studio vérifiera votre fichier et la faisabilité avant toute création de commande.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
      <div className="relative overflow-hidden rounded-3xl border border-brand-red/25 bg-gradient-to-br from-charcoal-800 via-charcoal-900 to-black p-5 shadow-2xl sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-red/10 blur-3xl" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-brand-red/30 bg-brand-red/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-red-light">LUNDER 3D · Atelier personnalisé</span>
          <span className="rounded-full border border-charcoal-400/20 px-3 py-1 text-[10px] text-charcoal-300">Jusqu’à 10 fichiers</span>
        </div>
        <h1 className="relative mt-4 max-w-2xl text-3xl font-black leading-tight text-offwhite sm:text-4xl">Votre idée. Votre style. Notre atelier.</h1>
        <p className="relative mt-3 max-w-2xl text-sm leading-6 text-charcoal-300 sm:text-base">
          Une pièce personnalisée en quelques étapes simples. Ajoutez une photo ou un modèle 3D, choisissez ce que vous voulez et découvrez une estimation avant d’envoyer votre demande.
        </p>
        <div className="relative mt-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-charcoal-200">✦ Personnalisation</span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-charcoal-200">↗ Aperçu 3D selon le fichier</span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-charcoal-200">✓ Estimation avant envoi</span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            ['01', 'Projet et fichiers', 'Décrivez votre besoin et joignez vos références.'],
            ['02', 'Taille et estimation', 'Ajustez chaque modèle et consultez le calcul.'],
            ['03', 'Coordonnées', 'Confirmez votre livraison après acceptation.'],
          ].map(([number, label, detail], index) => (
            <div key={number} className={`rounded-xl border p-3 ${(estimateAccepted ? index < 3 : estimate ? index < 2 : index === 0) ? 'border-brand-red/40 bg-brand-red/10' : 'border-charcoal-400/15 bg-black/20'}`}>
              <p className="text-[10px] font-bold tracking-widest text-brand-red-light">{number}</p>
              <p className="mt-1 text-sm font-semibold text-offwhite">{label}</p>
              <p className="mt-1 text-xs leading-5 text-charcoal-400">{detail}</p>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="admin-card rounded-2xl">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red/15 text-sm font-black text-brand-red-light">01</span><div><h2 className="text-lg font-bold text-offwhite">Parlez-nous de votre idée</h2><p className="mt-0.5 text-xs text-charcoal-400">Un titre et quelques détails suffisent pour commencer.</p></div></div>
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

        <div className="admin-card rounded-2xl">
          <div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red/15 text-sm font-black text-brand-red-light">02</span><div><h2 className="text-lg font-bold text-offwhite">Ajoutez vos photos ou fichiers 3D</h2><p className="mt-0.5 text-xs text-charcoal-400">Vous pouvez aussi continuer sans fichier en saisissant les dimensions.</p></div></div>
          <p className="mb-4 text-xs text-charcoal-400">
            Photos et fichiers 3D sont stockés dans un espace privé, accessibles uniquement au
            studio. Formats acceptés : JPG, PNG, WebP, AVIF (5 Mo), GLB, GLTF, STL, OBJ (25 Mo).
            Les fichiers 3D autonomes sont analysés pour extraire leurs dimensions et, lorsque possible,
            le volume du maillage. Les mesures STL/OBJ supposent des millimètres ; le client peut ensuite
            choisir les dimensions finales. Le temps et le poids de filament restent indicatifs sans G-code.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-charcoal-400/30 bg-charcoal-900/40 px-4 py-4 text-sm font-semibold text-charcoal-100 transition hover:border-brand-red/60 hover:bg-brand-red/5">
              <Upload className="h-5 w-5 text-brand-red-light" />
              Ajouter des photos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                disabled={uploading}
                className="hidden"
                onChange={(event) => { const selected = event.currentTarget.files; void handleFiles(selected, 'image'); event.currentTarget.value = '' }}
              />
            </label>
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-charcoal-400/30 bg-charcoal-900/40 px-4 py-4 text-sm font-semibold text-charcoal-100 transition hover:border-brand-red/60 hover:bg-brand-red/5">
              <Paperclip className="h-5 w-5 text-brand-red-light" />
              Ajouter un fichier 3D
              <input
                type="file"
                accept=".glb,.gltf,.stl,.obj"
                multiple
                disabled={uploading}
                className="hidden"
                onChange={(event) => { const selected = event.currentTarget.files; void handleFiles(selected, 'model'); event.currentTarget.value = '' }}
              />
            </label>
          </div>

          {uploading && (
            <p className="mt-3 flex items-center gap-2 text-xs text-charcoal-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Téléversement en cours…
            </p>
          )}

          {files.some((file) => file.kind === 'model' && !productSpecs.some((product) => product.filePath === file.path)) && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              Un fichier 3D n’a pas pu être analysé. Il ne sera pas ignoré dans le calcul : retirez-le ou réexportez-le en GLB autonome, STL ou OBJ valide avant de continuer.
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
                    disabled={uploading}
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
        <div className="admin-card rounded-2xl">
          <div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red/15 text-sm font-black text-brand-red-light">03</span><div><h2 className="text-lg font-bold text-offwhite">Choisissez la taille et la matière</h2><p className="mt-0.5 text-xs text-charcoal-400">Nous adaptons les questions selon les fichiers ajoutés.</p></div></div>
          <p className="mb-4 text-xs text-charcoal-400">
            Si vous ne joignez pas de modèle 3D, saisissez ses dimensions ici. Si vous joignez un ou plusieurs modèles analysables, leurs dimensions seront extraites automatiquement et vous pourrez définir la taille souhaitée pour chaque produit.
          </p>
          {productSpecs.length === 0 && (
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
                  onChange={(event) => { invalidateEstimate(); setter(event.target.value) }}
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
                onChange={(event) => { invalidateEstimate(); setMaterial(event.target.value) }}
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
                onChange={(event) => { invalidateEstimate(); setQuantity(event.target.value) }}
                className="input-field"
              />
            </label>
          </div>

          )}
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
                  checked={options[key] || (key === 'modeling' && productSpecs.some((product) => product.mode === 'modify' || product.mode === 'inspiration')) || (key === 'design' && productSpecs.some((product) => product.mode === 'inspiration'))}
                  disabled={(key === 'modeling' && productSpecs.some((product) => product.mode === 'modify' || product.mode === 'inspiration')) || (key === 'design' && productSpecs.some((product) => product.mode === 'inspiration'))}
                  onChange={(event) => {
                    invalidateEstimate()
                    setOptions((current) => ({ ...current, [key]: event.target.checked }))
                  }}
                  className="h-3.5 w-3.5 accent-brand-red"
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={rush}
                onChange={(event) => { invalidateEstimate(); setRush(event.target.checked) }}
                className="h-3.5 w-3.5 accent-brand-red"
              />
              Production urgente
            </label>
          </div>
        </div>

        {productSpecs.length > 0 && (
          <div className="admin-card space-y-4 rounded-2xl">
            <div className="mb-2 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red/15 text-sm font-black text-brand-red-light">04</span><div><h2 className="text-lg font-bold text-offwhite">Personnalisez chaque modèle</h2><p className="mt-1 text-xs text-charcoal-400">Chaque modèle possède ses propres dimensions, matière, couleur et quantité. Le calcul se met à jour automatiquement.</p></div></div>
            {productSpecs.map((product, index) => (
              <div key={product.id} className="space-y-4 rounded-2xl border border-charcoal-400/20 bg-gradient-to-br from-charcoal-900/80 to-black/30 p-4 shadow-lg sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-offwhite">Produit {index + 1} · {product.fileName}</p>
                    <p className="mt-1 text-xs text-charcoal-400">Original : {product.original.length} × {product.original.width} × {product.original.height} mm · {product.analysis.triangleCount.toLocaleString('fr-FR')} triangles · {product.analysis.componentCount ?? '—'} élément(s) détecté(s)</p>
                    {product.analysis.meshVolumeCm3 !== null && <p className="text-xs text-charcoal-400">Volume géométrique du maillage : {product.analysis.meshVolumeCm3} cm³</p>}
                  </div>
                  <button type="button" onClick={() => void removeFile(product.filePath)} disabled={uploading} className="btn-ghost text-xs">Retirer ce produit</button>
                </div>
                {product.previewUrl ? (
                  <div className="overflow-hidden rounded-lg border border-charcoal-400/15">
                    <p className="px-3 py-2 text-xs text-charcoal-400">Aperçu 3D interactif — faites glisser pour tourner et utilisez le zoom</p>
                    {createElement('model-viewer' as ElementType, {
                      src: product.previewUrl,
                      alt: `Aperçu 3D de ${product.fileName}`,
                      'camera-controls': true,
                      'auto-rotate': true,
                      'shadow-intensity': '0.8',
                      style: { width: '100%', height: '260px', background: '#111827' },
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-charcoal-500">Aperçu direct disponible pour GLB/GLTF. Le fichier STL/OBJ reste accessible au studio et ses dimensions sont analysées.</p>
                )}
                <label className="block">
                  <span className="label-text">Rôle du fichier</span>
                  <select className="input-field" value={product.mode} onChange={(event) => {
                    const mode = event.target.value as ProductSpec['mode']
                    updateProduct(product.id, { mode, ...(mode === 'exact' ? { target: { ...product.original } } : {}) })
                    if (mode === 'modify' || mode === 'inspiration') setOptions((current) => ({ ...current, modeling: true, ...(mode === 'inspiration' ? { design: true } : {}) }))
                  }}>
                    <option value="reference">Exemple / même forme, taille au choix</option>
                    <option value="exact">Fabriquer exactement à la taille du fichier</option>
                    <option value="modify">Modifier le modèle avant fabrication</option>
                    <option value="inspiration">Inspiration seulement, création similaire</option>
                  </select>
                  <p className="mt-2 rounded-lg bg-black/20 px-3 py-2 text-xs leading-5 text-charcoal-300">
                    {product.mode === 'exact'
                      ? 'Le studio utilisera les dimensions détectées dans votre fichier.'
                      : product.mode === 'modify'
                        ? 'Décrivez les changements souhaités. Le studio vérifiera ce qui peut être modifié avant fabrication.'
                        : product.mode === 'inspiration'
                          ? 'Le fichier sert d’inspiration : décrivez la nouvelle pièce que vous imaginez.'
                          : 'Le fichier sert de référence. Vous pouvez garder sa forme et choisir une autre taille.'}
                  </p>
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['length', 'width', 'height'] as const).map((axis) => (
                    <label key={axis} className="block">
                      <span className="label-text">{axis === 'length' ? 'Longueur' : axis === 'width' ? 'Largeur' : 'Hauteur'} souhaitée (mm)</span>
                      <input type="number" min="1" max="2000" step="0.1" className="input-field" value={product.target[axis]} disabled={product.mode === 'exact'} onChange={(event) => updateProductDimension(product, axis, event.target.value)} />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-charcoal-300">
                    <input type="checkbox" checked={product.preserveRatio} disabled={product.mode === 'exact'} onChange={(event) => updateProduct(product.id, { preserveRatio: event.target.checked })} className="accent-brand-red" />
                    Conserver les proportions
                  </label>
                  <label className="flex items-center gap-2 text-xs text-charcoal-300">
                    Quantité
                    <input type="number" min="1" max="100" value={product.quantity} onChange={(event) => updateProduct(product.id, { quantity: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} className="input-field w-24" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label-text">Matière pour ce produit</span>
                    <select className="input-field" value={product.material} onChange={(event) => updateProduct(product.id, { material: event.target.value })}>
                      {materials.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-text">Couleur</span>
                    <input className="input-field" value={product.color} onChange={(event) => updateProduct(product.id, { color: event.target.value })} placeholder="Couleur souhaitée" />
                  </label>
                </div>
                <label className="block">
                  <span className="label-text">Détails ou modifications pour ce produit</span>
                  <textarea rows={3} maxLength={2000} className="input-field resize-y" value={product.instructions} onChange={(event) => updateProduct(product.id, { instructions: event.target.value })} placeholder={product.mode === 'modify' ? 'Ex. ajouter une base, inscrire un prénom, retirer une partie, renforcer une zone…' : product.mode === 'inspiration' ? 'Décrivez le modèle que vous voulez créer en vous inspirant de ce fichier…' : 'Précisions propres à ce modèle (facultatif)…'} />
                </label>
                {product.analysis.warnings.length > 0 && <ul className="space-y-1 text-xs text-amber-300">{product.analysis.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>}
                {product.mode === 'modify' && <p className="text-xs text-charcoal-400">Les modifications demandées doivent être décrites dans le champ Description ; le studio validera leur faisabilité.</p>}
                {product.mode === 'inspiration' && <p className="text-xs text-charcoal-400">Ce fichier sert de référence visuelle. Décrivez précisément le nouveau modèle souhaité.</p>}
              </div>
            ))}
          </div>
        )}

        <div className="admin-card rounded-2xl border border-brand-red/20">
          <div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red/15 text-sm font-black text-brand-red-light">05</span><div><h2 className="text-lg font-bold text-offwhite">Votre estimation</h2><p className="mt-0.5 text-xs text-charcoal-400">Le montant se recalcule selon vos choix.</p></div></div>
          <p className="mb-4 text-xs text-charcoal-400">
            Estimation indicative calculée séparément pour chaque produit, avec sa taille finale, sa matière, sa quantité et les paramètres de fabrication du studio. Elle ne constitue pas un devis ferme : le propriétaire vérifie la faisabilité et peut ajuster le prix.
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-red/25 bg-brand-red/10 px-4 py-4 text-base font-bold text-offwhite">
                <span>Total estimé ({estimate.quantity} pièce(s))</span>
                <span>{formatDzd(estimate.totalDzd)}</span>
              </div>
              {estimate.estimates && (
                <p className="mt-2 text-xs text-charcoal-500">
                  Estimation de production : environ {estimate.estimates.grams ?? '—'} g et{' '}
                  {estimate.estimates.printHours ?? '—'} h — méthode : {estimate.estimates.method === 'multiple_model_geometry_or_bounding_box_estimates' ? 'calcul séparé par modèle à partir du volume du maillage si disponible, sinon des dimensions' : 'boîte englobante'}.
                </p>
              )}
              {estimate.assumptions && estimate.assumptions.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-charcoal-500">
                  {estimate.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
                </ul>
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



        {estimateAccepted && (
          <>
            <div className="admin-card rounded-2xl">
              <div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red/15 text-sm font-black text-brand-red-light">06</span><div><h2 className="text-lg font-bold text-offwhite">Comment vous contacter ?</h2><p className="mt-0.5 text-xs text-charcoal-400">Vos coordonnées restent liées à cette demande.</p></div></div>
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

            <div className="admin-card rounded-2xl">
              <div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red/15 text-sm font-black text-brand-red-light">07</span><div><h2 className="text-lg font-bold text-offwhite">Où souhaitez-vous recevoir votre pièce ?</h2><p className="mt-0.5 text-xs text-charcoal-400">Choisissez votre wilaya, commune et mode de livraison.</p></div></div>
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

            <button type="submit" disabled={submitting || uploading} className="btn-primary min-h-12 w-full justify-center rounded-xl text-base font-bold shadow-lg shadow-brand-red/15">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer ma demande complète'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
