import { useEffect, useState, useRef } from 'react'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, Upload, X, Star, Plus, Trash2 } from 'lucide-react'
import {
  supabase,
  type Category,
  type Product,
  type ProductImage,
  type ProductOption,
  type ProductVariant,
} from '@/lib/supabase'
import { slugify, generateSku } from '@/lib/format'
import { validateImage, validateModel } from '@/lib/media'
import posthog, { isPostHogEnabled } from '@/lib/posthog'

export default function AdminProductEdit() {
  const confirmAction = useAdminConfirm()
  const { id } = useParams()
  const isNew = !id || id === 'nouveau'
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(isNew ? false : true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<ProductImage[]>([])
  const [originalModelUrl, setOriginalModelUrl] = useState('')
  const [colors, setColors] = useState<string[]>([])

  const [options, setOptions] = useState<ProductOption[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [newOptionName, setNewOptionName] = useState('')
  const [optionValueDraft, setOptionValueDraft] = useState<Record<string, string>>({})
  const [bulkValueDraft, setBulkValueDraft] = useState<Record<string, string>>({})
  const [selectedShapeId, setSelectedShapeId] = useState('')
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>([])
  const [variantSelection, setVariantSelection] = useState<Record<string, string>>({})
  const [variantPrice, setVariantPrice] = useState('')
  const [variantStock, setVariantStock] = useState('0')
  const [creatingVariants, setCreatingVariants] = useState(false)

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    category_id: '',
    sku: '',
    price_dzd: 0,
    stock_quantity: 0,
    made_to_order: false,
    production_lead_days: '',
    weight_g: '',
    dimensions: '',
    material: '',
    model_url: '',
    status: 'draft' as 'draft' | 'published' | 'archived',
    is_featured: false,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
  })

  useEffect(() => {
    loadCategories()
    if (!isNew && id) loadProduct(id)
  }, [id])

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').eq('is_active', true).order('name')
    setCategories((data as Category[]) ?? [])
  }

  const loadOptions = async (productId: string) => {
    const { data } = await supabase
      .from('product_options')
      .select('*, values:product_option_values(*)')
      .eq('product_id', productId)
      .order('sort_order')
    const parsed = ((data as ProductOption[]) ?? []).map((option) => ({
      ...option,
      values: [...(option.values ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value)
      ),
    }))
    setOptions(parsed)
  }

  const loadVariants = async (productId: string) => {
    const { data } = await supabase
      .from('product_variants')
      .select('*, values:product_variant_values(option_value_id)')
      .eq('product_id', productId)
      .order('created_at')
    setVariants((data as ProductVariant[]) ?? [])
  }

  const loadProduct = async (productId: string) => {
    const { data } = await supabase.from('products').select('*').eq('id', productId).maybeSingle()
    if (data) {
      const p = data as Product
      setForm({
        name: p.name,
        slug: p.slug,
        description: p.description ?? '',
        category_id: p.category_id ?? '',
        sku: p.sku,
        price_dzd: p.price_dzd,
        stock_quantity: p.stock_quantity,
        made_to_order: p.made_to_order,
        production_lead_days: p.production_lead_days?.toString() ?? '',
        weight_g: p.weight_g?.toString() ?? '',
        dimensions: p.dimensions ?? '',
        material: p.material ?? '',
        model_url: p.model_url ?? '',
        status: p.status,
        is_featured: p.is_featured,
        seo_title: p.seo_title ?? '',
        seo_description: p.seo_description ?? '',
        seo_keywords: ((p as Product & { seo_keywords?: string[] }).seo_keywords ?? []).join(', '),
      })
      setOriginalModelUrl(p.model_url ?? '')
      setColors(p.available_colors ?? [])
    }
    const { data: imgs } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order')
    setImages((imgs as ProductImage[]) ?? [])
    await Promise.all([loadOptions(productId), loadVariants(productId)])
    setLoading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !id) return
    setUploading(true)
    setError(null)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const check = await validateImage(file)
        if (!check.ok) throw new Error(check.message)

        const path = `${id}/${Date.now()}-${i}.${check.extension}`
        const { error: upErr } = await supabase.storage
          .from('product-images')
          .upload(path, file, { contentType: check.contentType, upsert: false })
        if (upErr) throw new Error(`Échec de l’envoi de « ${file.name} » : ${upErr.message}. Vérifiez votre connexion, votre session propriétaire et la limite de 5 Mo.`)

        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
        const isPrimary = images.length === 0 && i === 0
        const { data: imgData, error: imageInsertError } = await supabase
          .from('product_images')
          .insert({
            product_id: id,
            image_url: urlData.publicUrl,
            alt_text: form.name,
            sort_order: images.length + i,
            is_primary: isPrimary,
          })
          .select('*')
          .single()
        if (imageInsertError || !imgData) {
          await supabase.storage.from('product-images').remove([path])
          throw new Error(`La photo a été envoyée, mais son ajout à la galerie a échoué : ${imageInsertError?.message ?? 'aucune donnée retournée'}`)
        }
        setImages((prev) => [...prev, imgData as ProductImage])
      }
      if (isPostHogEnabled) {
        posthog.capture('product_images_uploaded', { product_id: id, image_count: files.length })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload de l'image.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploading(true)
    setError(null)
    try {
      const check = await validateModel(file)
      if (!check.ok) throw new Error(check.message)

      const path = `${id}/model-${Date.now()}.${check.extension}`
      const { error: upErr } = await supabase.storage
        .from('product-models')
        .upload(path, file, { contentType: check.contentType, upsert: false })
      if (upErr) throw new Error('Le stockage a refusé le modèle (format ou taille).')

      const { data: urlData } = supabase.storage.from('product-models').getPublicUrl(path)
      const previousPath = form.model_url.split('/product-models/')[1]
      setForm((prev) => ({ ...prev, model_url: urlData.publicUrl }))
      if (isPostHogEnabled) posthog.capture('product_model_uploaded', { product_id: id })

      if (previousPath && form.model_url !== originalModelUrl && previousPath.startsWith(`${id}/`)) {
        const { data: references, error: referenceError } = await supabase.from('products').select('id').eq('model_url', form.model_url).neq('id', id).limit(1)
        if (!referenceError && !references?.length) {
          const { error: cleanupError } = await supabase.storage.from('product-models').remove([previousPath])
          if (cleanupError) setError('Le nouveau modèle est chargé, mais un ancien fichier temporaire n’a pas pu être nettoyé.')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload du modèle 3D.")
    } finally {
      setUploading(false)
      if (modelInputRef.current) modelInputRef.current.value = ''
    }
  }

  const setPrimaryImage = async (imageId: string) => {
    if (!id) return
    setError(null)
    const previousPrimary = images.find((image) => image.is_primary)
    const { error: clearError } = await supabase.from('product_images').update({ is_primary: false }).eq('product_id', id)
    if (clearError) {
      setError(`Impossible de modifier la photo principale : ${clearError.message}`)
      return
    }
    const { error: primaryError } = await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId).eq('product_id', id)
    if (primaryError) {
      if (previousPrimary) await supabase.from('product_images').update({ is_primary: true }).eq('id', previousPrimary.id).eq('product_id', id)
      setError(`La photo principale n’a pas été modifiée : ${primaryError.message}`)
      return
    }
    setImages((prev) => prev.map((img) => ({ ...img, is_primary: img.id === imageId })))
    if (isPostHogEnabled) posthog.capture('product_primary_image_set', { product_id: id, image_id: imageId })
  }

  const storagePath = (url: string, bucket: 'product-images' | 'product-models') => {
    try {
      const parsed = new URL(url)
      const marker = `/${bucket}/`
      const index = parsed.pathname.indexOf(marker)
      return index >= 0 ? decodeURIComponent(parsed.pathname.slice(index + marker.length)) : null
    } catch { return null }
  }

  const deleteImage = async (imageId: string, imageUrl: string) => {
    if (!id || !(await confirmAction({ title: 'Supprimer cette photo ?', description: 'La photo sera retirée de la galerie du produit.', confirmLabel: 'Supprimer la photo', tone: 'danger' }))) return
    const image = images.find((item) => item.id === imageId)
    const { error: deleteError } = await supabase.from('product_images').delete().eq('id', imageId).eq('product_id', id)
    if (deleteError) { setError('Impossible de supprimer cette photo. Réessayez.'); return }
    const remaining = images.filter((item) => item.id !== imageId)
    setImages(remaining)
    if (image?.is_primary && remaining[0]) {
      const { error: primaryError } = await supabase.from('product_images').update({ is_primary: true }).eq('id', remaining[0].id).eq('product_id', id)
      if (!primaryError) setImages((current) => current.map((item) => ({ ...item, is_primary: item.id === remaining[0].id })))
    }
    const path = storagePath(imageUrl, 'product-images')
    if (path && path.startsWith(`${id}/`)) {
      const { data: references, error: referenceError } = await supabase.from('product_images').select('id').eq('image_url', imageUrl).limit(1)
      if (referenceError) setError('La photo a été retirée du produit, mais la vérification des références du fichier a échoué; le fichier a été conservé par sécurité.')
      else if (!references?.length) {
        const { error: storageError } = await supabase.storage.from('product-images').remove([path])
        if (storageError) setError('La photo a été retirée du produit, mais son fichier reste dans le stockage et devra être nettoyé.')
      }
    }
    if (isPostHogEnabled) posthog.capture('product_image_deleted', { product_id: id, image_id: imageId })
  }

  const deleteModel = async () => {
    if (!id || !form.model_url || !(await confirmAction({ title: 'Supprimer le modèle 3D ?', description: 'Le modèle sera retiré du produit. Les photos resteront disponibles.', confirmLabel: 'Supprimer le modèle', tone: 'danger' }))) return
    const previousUrl = form.model_url
    const { error: updateError } = await supabase.from('products').update({ model_url: null }).eq('id', id)
    if (updateError) { setError('Impossible de retirer le modèle 3D du produit.'); return }
    setForm((current) => ({ ...current, model_url: '' }))
    setOriginalModelUrl('')
    const path = storagePath(previousUrl, 'product-models')
    if (path && path.startsWith(`${id}/`)) {
      const { data: references, error: referenceError } = await supabase.from('products').select('id').eq('model_url', previousUrl).neq('id', id).limit(1)
      if (referenceError) setError('Le modèle a été retiré du produit, mais le contrôle des références a échoué; le fichier a été conservé par sécurité.')
      else if (!references?.length) {
        const { error: storageError } = await supabase.storage.from('product-models').remove([path])
        if (storageError) setError('Le modèle a été retiré du produit, mais son fichier reste dans le stockage et devra être nettoyé.')
      }
    }
  }

  const addOption = async () => {
    if (!id) return
    const name = newOptionName.trim()
    if (!name) return
    setError(null)
    const { data, error: insertError } = await supabase
      .from('product_options')
      .insert({ product_id: id, name, sort_order: options.length })
      .select('*')
      .single()
    if (insertError || !data) {
      setError("Impossible d'ajouter cette option (un nom identique existe peut-être déjà).")
      return
    }
    setOptions((prev) => [...prev, { ...(data as ProductOption), values: [] }])
    setNewOptionName('')
  }

  const deleteOption = async (optionId: string) => {
    if (!id) return
    if (!(await confirmAction({ title: 'Supprimer cette option et ses valeurs ?', description: 'Les variantes concernées perdront ce choix.', confirmLabel: 'Supprimer l’option', tone: 'danger' }))) return
    const { error: deleteError } = await supabase.from('product_options').delete().eq('id', optionId)
    if (deleteError) {
      setError("Impossible de supprimer cette option.")
      return
    }
    setVariantSelection((prev) => {
      const next = { ...prev }
      delete next[optionId]
      return next
    })
    await Promise.all([loadOptions(id), loadVariants(id)])
  }

  const addOptionValue = async (option: ProductOption) => {
    const value = (optionValueDraft[option.id] ?? '').trim()
    if (!value) return
    setError(null)
    const { error: insertError } = await supabase.from('product_option_values').insert({
      option_id: option.id,
      value,
      sort_order: (option.values ?? []).length,
    })
    if (insertError) {
      setError('Impossible d’ajouter cette valeur (elle existe peut-être déjà).')
      return
    }
    setOptionValueDraft((prev) => ({ ...prev, [option.id]: '' }))
    if (id) await loadOptions(id)
  }

  const addOptionValuesBulk = async (option: ProductOption) => {
    if (!id) return
    const values = (bulkValueDraft[option.id] ?? '').split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean)
    const existing = new Set((option.values ?? []).map((v) => v.value.toLowerCase()))
    const unique = [...new Set(values)].filter((v) => !existing.has(v.toLowerCase()))
    if (!unique.length) { setError('Toutes ces valeurs existent déjà.'); return }
    const { error } = await supabase.from('product_option_values').insert(unique.map((value, index) => ({ option_id: option.id, value, sort_order: (option.values ?? []).length + index })))
    if (error) { setError("Impossible d'ajouter les valeurs."); return }
    setBulkValueDraft((prev) => ({ ...prev, [option.id]: '' }))
    await loadOptions(id)
  }

  const uploadOptionValueImage = async (valueId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !id) return
    setUploading(true)
    try {
      const check = await validateImage(file)
      if (!check.ok) throw new Error(check.message)
      const path = `${id}/options/${valueId}-${Date.now()}.${check.extension}`
      const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file, { contentType: check.contentType, upsert: false })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      const { error } = await supabase.from('product_option_values').update({ image_url: data.publicUrl }).eq('id', valueId)
      if (error) { await supabase.storage.from('product-images').remove([path]); if (/image_url|column/i.test(error.message)) throw new Error('Appliquez la migration 020 pour activer les photos des formes et couleurs.'); throw error }
      await loadOptions(id)
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur lors de l'envoi de la photo.") }
    finally { setUploading(false); event.target.value = '' }
  }

  const createSelectedShapeColorVariants = async () => {
    if (!id) return
    const shapeOption = options.find((o) => /^(forme|shape)$/i.test(o.name.trim()))
    const colorOption = options.find((o) => /^(couleur|color|colour)$/i.test(o.name.trim()))
    const shape = shapeOption?.values?.find((v) => v.id === selectedShapeId)
    const chosen = (colorOption?.values ?? []).filter((v) => selectedColorIds.includes(v.id) && v.is_active)
    if (!shape || !chosen.length) { setError('Choisissez une forme et au moins une couleur.'); return }
    const existing = new Set(variants.map((v) => (v.values ?? []).map((x) => x.option_value_id).sort().join(',')))
    const missing = chosen.filter((color) => !existing.has([shape.id, color.id].sort().join(',')))
    if (!missing.length) { setError('Ces variantes existent déjà.'); return }
    const price = variantPrice.trim() ? Math.round(Number(variantPrice)) : null
    const stock = Number(variantStock)
    if ((price !== null && (!Number.isFinite(price) || price < 0)) || !Number.isFinite(stock) || stock < 0) { setError('Vérifiez le prix et le stock.'); return }
    setCreatingVariants(true); setError(null)
    const created: string[] = []
    try {
      for (const color of missing) {
        const { data, error } = await supabase.from('product_variants').insert({ product_id: id, label: `${shape.value} / ${color.value}`, price_dzd: price, stock_quantity: Math.round(stock) }).select('id').single()
        if (error || !data) throw new Error(error?.message ?? 'Création impossible.')
        created.push(data.id)
        const { error: linkError } = await supabase.from('product_variant_values').insert([{ variant_id: data.id, option_value_id: shape.id }, { variant_id: data.id, option_value_id: color.id }])
        if (linkError) throw linkError
      }
      await loadVariants(id); setSelectedColorIds([]); setVariantPrice(''); setVariantStock('0')
    } catch (err) { if (created.length) await supabase.from('product_variants').delete().in('id', created); setError(err instanceof Error ? err.message : 'Création impossible.'); await loadVariants(id) }
    finally { setCreatingVariants(false) }
  }

  const deleteOptionValue = async (valueId: string) => {
    if (!id) return
    const { error: deleteError } = await supabase.from('product_option_values').delete().eq('id', valueId)
    if (deleteError) {
      setError('Impossible de supprimer cette valeur.')
      return
    }
    await Promise.all([loadOptions(id), loadVariants(id)])
  }

  const selectedValueIds = options.map((option) => variantSelection[option.id]).filter(Boolean)
  const combinationComplete = options.length > 0 && selectedValueIds.length === options.length

  const createVariantsForSingleOption = async () => {
    if (!id || options.length !== 1) return
    const option = options[0]
    const values = (option.values ?? []).filter((value) => value.is_active)
    const existingValueIds = new Set(
      variants.flatMap((variant) => (variant.values ?? []).map((item) => item.option_value_id))
    )
    const missingValues = values.filter((value) => !existingValueIds.has(value.id))
    if (missingValues.length === 0) {
      setError('Toutes les valeurs ont déjà leur variante.')
      return
    }

    const price = variantPrice.trim() ? Math.round(Number(variantPrice)) : null
    const stock = Number(variantStock)
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError('Le prix des variantes doit être un nombre positif.')
      return
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setError('Le stock initial doit être un nombre positif ou nul.')
      return
    }

    setError(null)
    const { data: created, error: createError } = await supabase
      .from('product_variants')
      .insert(missingValues.map((value) => ({
        product_id: id,
        label: value.value,
        price_dzd: price,
        stock_quantity: Math.round(stock),
      })))
      .select('id, label')

    if (createError || !created?.length) {
      setError('Impossible de créer automatiquement les variantes.')
      return
    }

    const links = created.map((variant) => {
      const value = missingValues.find((item) => item.value === variant.label)
      return value ? { variant_id: variant.id, option_value_id: value.id } : null
    }).filter((link): link is { variant_id: string; option_value_id: string } => link !== null)

    const { error: linkError } = await supabase.from('product_variant_values').insert(links)
    if (linkError) {
      await supabase.from('product_variants').delete().in('id', created.map((variant) => variant.id))
      setError('Les variantes n’ont pas pu être reliées à leurs valeurs. Aucune variante partielle n’a été conservée.')
      return
    }

    await loadVariants(id)
  }

  const createAllVariantCombinations = async () => {
    if (!id || options.length === 0) return
    const optionValues = options.map((option) => ({
      option,
      values: (option.values ?? []).filter((value) => value.is_active),
    }))
    if (optionValues.some((item) => item.values.length === 0)) {
      setError('Ajoutez au moins une valeur active pour chaque option.')
      return
    }

    const combinations: { valueIds: string[]; label: string }[] = []
    const build = (index: number, selected: { optionId: string; valueId: string; label: string }[]) => {
      if (index === optionValues.length) {
        combinations.push({
          valueIds: selected.map((item) => item.valueId),
          label: selected.map((item) => item.label).join(' / '),
        })
        return
      }
      const current = optionValues[index]
      current.values.forEach((value) => build(index + 1, [
        ...selected,
        { optionId: current.option.id, valueId: value.id, label: value.value },
      ]))
    }
    build(0, [])

    if (combinations.length > 100) {
      setError('Cette configuration crée plus de 100 variantes. Réduisez les valeurs ou créez les variantes nécessaires manuellement.')
      return
    }

    const existing = new Set(variants.map((variant) =>
      (variant.values ?? []).map((item) => item.option_value_id).sort().join(',')
    ))
    const missing = combinations.filter((item) => !existing.has([...item.valueIds].sort().join(',')))
    if (missing.length === 0) {
      setError('Toutes les combinaisons existent déjà.')
      return
    }

    const price = variantPrice.trim() ? Math.round(Number(variantPrice)) : null
    const stock = Number(variantStock)
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError('Le prix des variantes doit être un nombre positif.')
      return
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setError('Le stock initial doit être un nombre positif ou nul.')
      return
    }

    setCreatingVariants(true)
    setError(null)
    const createdIds: string[] = []
    try {
      for (const combination of missing) {
        const { data, error: createError } = await supabase
          .from('product_variants')
          .insert({
            product_id: id,
            label: combination.label,
            price_dzd: price,
            stock_quantity: Math.round(stock),
          })
          .select('id')
          .single()
        if (createError || !data) throw new Error(createError?.message ?? 'Création de variante impossible.')
        createdIds.push(data.id)

        const { error: linkError } = await supabase.from('product_variant_values').insert(
          combination.valueIds.map((valueId) => ({ variant_id: data.id, option_value_id: valueId }))
        )
        if (linkError) throw new Error(linkError.message)
      }
      await loadVariants(id)
      setVariantSelection({})
      setVariantPrice('')
      setVariantStock('0')
    } catch (err) {
      if (createdIds.length > 0) {
        const { error: cleanupError } = await supabase.from('product_variants').delete().in('id', createdIds)
        setError(cleanupError
          ? 'Une erreur est survenue et certaines variantes peuvent nécessiter une vérification dans l’administration.'
          : 'La création a échoué. Les variantes créées pendant cette opération ont été annulées.')
      } else {
        setError(err instanceof Error ? err.message : 'Impossible de créer les variantes.')
      }
      await loadVariants(id)
    } finally {
      setCreatingVariants(false)
    }
  }

  const createVariant = async () => {
    if (!id || !combinationComplete) return
    setError(null)

    const signature = [...selectedValueIds].sort().join(',')
    const duplicate = variants.some(
      (variant) =>
        (variant.values ?? [])
          .map((item) => item.option_value_id)
          .sort()
          .join(',') === signature
    )
    if (duplicate) {
      setError('Cette combinaison existe déjà.')
      return
    }

    const label = options
      .map((option) => option.values?.find((value) => value.id === variantSelection[option.id])?.value ?? '')
      .filter(Boolean)
      .join(' / ')

    const price = variantPrice.trim() ? Math.round(Number(variantPrice)) : null
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError('Le prix de la variante doit être un nombre positif.')
      return
    }

    const { data, error: variantError } = await supabase
      .from('product_variants')
      .insert({
        product_id: id,
        label,
        price_dzd: price,
        stock_quantity: Math.max(0, Math.round(Number(variantStock) || 0)),
      })
      .select('id')
      .single()

    if (variantError || !data) {
      setError("Impossible de créer la variante.")
      return
    }

    const { error: linkError } = await supabase
      .from('product_variant_values')
      .insert(selectedValueIds.map((valueId) => ({ variant_id: data.id, option_value_id: valueId })))

    if (linkError) {
      await supabase.from('product_variants').delete().eq('id', data.id)
      setError('Impossible d’enregistrer les options de cette variante.')
      return
    }

    setVariantSelection({})
    setVariantPrice('')
    setVariantStock('0')
    await loadVariants(id)
  }

  const handleVariantImageUpload = async (
    variant: ProductVariant,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file || !id) return
    setUploading(true)
    setError(null)
    try {
      const check = await validateImage(file)
      if (!check.ok) throw new Error(check.message)
      const path = id + '/variants/' + variant.id + '-' + (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString()) + '.' + check.extension
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { contentType: check.contentType, upsert: false })
      if (uploadError) throw new Error(`Échec de l’envoi de la photo : ${uploadError.message}. Vérifiez que vous êtes connecté en tant que propriétaire et que l’image fait moins de 5 Mo.`)
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
      const { error: updateError } = await supabase
        .from('product_variants')
        .update({ image_url: urlData.publicUrl })
        .eq('id', variant.id)
        .eq('product_id', id)
      if (updateError) {
        await supabase.storage.from('product-images').remove([path])
        if (/image_url|column/i.test(updateError.message)) {
          throw new Error('La photo n’a pas été associée : le champ image_url manque dans Supabase. La migration 018 doit être appliquée.')
        }
        throw new Error(`Impossible d’associer la photo à cette variante : ${updateError.message}`)
      }
      setVariants((current) =>
        current.map((item) => item.id === variant.id ? { ...item, image_url: urlData.publicUrl } : item)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du téléversement de la photo.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const toggleVariant = async (variant: ProductVariant) => {
    const { error: updateError } = await supabase
      .from('product_variants')
      .update({ is_active: !variant.is_active })
      .eq('id', variant.id)
    if (updateError) {
      setError('Impossible de modifier cette variante.')
      return
    }
    if (id) await loadVariants(id)
  }

  const deleteVariant = async (variantId: string) => {
    if (!id) return
    const { error: deleteError } = await supabase.from('product_variants').delete().eq('id', variantId)
    if (deleteError) {
      setError('Impossible de supprimer cette variante.')
      return
    }
    await loadVariants(id)
  }

  const variantLabel = (variant: ProductVariant) => {
    if (variant.label) return variant.label
    const names = (variant.values ?? [])
      .map((item) => options.flatMap((option) => option.values ?? []).find((value) => value.id === item.option_value_id)?.value)
      .filter(Boolean)
    return names.join(' / ') || 'Variante'
  }

  const handleSave = async (publish = false) => {
    setError(null)
    if (!form.name.trim()) {
      setError('Le nom du produit est requis.')
      return
    }
    if (form.price_dzd < 0) {
      setError('Le prix doit être un nombre positif.')
      return
    }
    setSaving(true)

    try {
      const category = categories.find((c) => c.id === form.category_id)
      const sku = form.sku.trim() || generateSku(category?.name ?? 'GEN', Math.floor(Math.random() * 9000) + 1000)
      const slug = slugify(form.slug.trim() || form.name)
      const payload = {
        name: form.name.trim(),
        slug,
        description: form.description || null,
        category_id: form.category_id || null,
        sku,
        price_dzd: Math.round(form.price_dzd),
        stock_quantity: form.made_to_order ? 0 : Math.round(form.stock_quantity),
        made_to_order: form.made_to_order,
        production_lead_days: form.production_lead_days ? parseInt(form.production_lead_days) : null,
        weight_g: form.weight_g ? parseFloat(form.weight_g) : null,
        dimensions: form.dimensions || null,
        material: form.material || null,
        available_colors: colors,
        model_url: form.model_url || null,
        status: publish ? ('published' as const) : form.status,
        is_featured: form.is_featured,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
      }
      const { error: seoColumnError } = await supabase.from('products').select('seo_keywords').limit(1)
      const savePayload = seoColumnError
        ? payload
        : { ...payload, seo_keywords: form.seo_keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean) }

      if (isNew) {
        const { data, error: insErr } = await supabase.from('products').insert(savePayload).select('*').single()
        if (insErr) throw insErr
        if (isPostHogEnabled) {
          posthog.capture('product_created', { product_id: (data as Product).id, has_model: Boolean(payload.model_url) })
        }
        navigate(`/admin/produits/${(data as Product).id}`, { replace: true })
      } else if (id) {
        const { error: upErr } = await supabase.from('products').update(savePayload).eq('id', id)
        if (upErr) throw upErr
        if (originalModelUrl && originalModelUrl !== payload.model_url) {
          const previousPath = storagePath(originalModelUrl, 'product-models')
          if (previousPath && previousPath.startsWith(`${id}/`)) {
            const { data: references, error: referenceError } = await supabase.from('products').select('id').eq('model_url', originalModelUrl).neq('id', id).limit(1)
            if (!referenceError && !references?.length) {
              const { error: cleanupError } = await supabase.storage.from('product-models').remove([previousPath])
              if (cleanupError) setError('Produit enregistré, mais l’ancien modèle reste à nettoyer dans le stockage.')
            }
          }
        }
        setOriginalModelUrl(payload.model_url ?? '')
        if (isPostHogEnabled) {
          posthog.capture('product_updated', { product_id: id, status: payload.status, has_model: Boolean(payload.model_url) })
        }
        // Le bandeau de visibilité doit refléter l'état réellement enregistré.
        setForm((prev) => ({ ...prev, status: payload.status }))
        if (seoColumnError && form.seo_keywords.trim()) setError('Produit enregistré. Les mots-clés SEO seront sauvegardés après application de la migration 014.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement du produit.")
    } finally {
      setSaving(false)
    }
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
      <button onClick={() => navigate('/admin/produits')} className="btn-ghost mb-4">
        <ArrowLeft className="h-4 w-4" />
        Retour aux produits
      </button>

      <h1 className="mb-2 text-2xl font-bold text-offwhite">
        {isNew ? 'Nouveau produit' : 'Modifier le produit'}
      </h1>
      {isNew && (
        <p className="mb-6 text-sm text-charcoal-400">
          Suivez les sections dans l’ordre : informations, prix et stock, photos, modèle 3D, puis couleurs et formes. Enregistrez une première fois pour activer les médias et les variantes ; vous pourrez ensuite tout gérer depuis cette même fiche produit.
        </p>
      )}

      {form.status !== 'published' && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {form.status === 'draft'
            ? 'Ce produit est en brouillon : il n’apparaît pas dans la boutique.'
            : 'Ce produit est archivé : il n’apparaît pas dans la boutique.'}{' '}
          Utilisez « Enregistrer et publier » pour le rendre visible aux clients.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}

      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-6">
          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Informations générales</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label-text">Nom du produit *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="Ex: Support de téléphone adjustable"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label-text">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  className="input-field resize-none"
                  placeholder="Description du produit en français..."
                />
              </div>
              <div>
                <label className="label-text">Catégorie</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="input-field"
                >
                  <option value="">Sélectionner...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Prix et stock</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-text">Prix (DA) *</label>
                <input
                  type="number"
                  min={0}
                  value={form.price_dzd}
                  onChange={(e) => setForm({ ...form, price_dzd: parseInt(e.target.value) || 0 })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">Stock</label>
                <input
                  type="number"
                  min={0}
                  disabled={form.made_to_order}
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })}
                  className="input-field disabled:opacity-50"
                />
              </div>
              <div>
                <label className="label-text">Délai de production (jours)</label>
                <input
                  type="number"
                  min={0}
                  value={form.production_lead_days}
                  onChange={(e) => setForm({ ...form, production_lead_days: e.target.value })}
                  className="input-field"
                  placeholder="Ex: 3"
                />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-charcoal-200">
                  <input
                    type="checkbox"
                    checked={form.made_to_order}
                    onChange={(e) => setForm({ ...form, made_to_order: e.target.checked })}
                    className="h-4 w-4 accent-brand-red"
                  />
                  Fabrication sur commande
                </label>
              </div>
            </div>
          </div>

          <details className="admin-card">
            <summary className="cursor-pointer list-none text-lg font-semibold text-offwhite">
              Informations techniques
              <span className="mt-1 block text-xs font-normal text-charcoal-400">Facultatif · matière, poids et dimensions</span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-text">Matière</label>
                <input
                  type="text"
                  value={form.material}
                  onChange={(e) => setForm({ ...form, material: e.target.value })}
                  className="input-field"
                  placeholder="Ex: PLA, PETG"
                />
              </div>
              <div>
                <label className="label-text">Poids (g)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={form.weight_g}
                  onChange={(e) => setForm({ ...form, weight_g: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label-text">Dimensions</label>
                <input
                  type="text"
                  value={form.dimensions}
                  onChange={(e) => setForm({ ...form, dimensions: e.target.value })}
                  className="input-field"
                  placeholder="Ex: 100 x 50 x 30 mm"
                />
              </div>
            </div>
          </details>

          {!isNew && (
            <div className="admin-card">
              <h2 className="mb-1 text-lg font-semibold text-offwhite">Couleurs, formes et variantes</h2>
              <p className="mb-4 text-xs text-charcoal-400">
                Ajoutez les caractéristiques que le client peut choisir (par exemple Couleur : Rouge, Noir ; Forme : Ronde, Carrée).
                Créez ensuite toutes les combinaisons en une fois. Chaque combinaison peut avoir sa photo, son prix et son stock ;
                le choix du client sera enregistré dans sa commande.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  className="input-field"
                  placeholder="Nom de l'option (ex: Couleur)"
                />
                <button type="button" onClick={addOption} className="btn-secondary px-4">
                  <Plus className="h-4 w-4" />
                  Ajouter
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {options.map((option) => (
                  <div key={option.id} className="rounded-lg border border-charcoal-400/15 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-offwhite">{option.name}</span>
                      <button
                        type="button"
                        onClick={() => deleteOption(option.id)}
                        className="text-charcoal-400 transition-colors hover:text-brand-red"
                        aria-label={`Supprimer l'option ${option.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {(option.values ?? []).length > 0 && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {(option.values ?? []).map((value) => (
                          <div key={value.id} className="flex items-center gap-2 rounded-lg bg-charcoal-800/60 p-2">
                            {value.image_url ? <img src={value.image_url} alt={value.value} className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded border border-dashed border-charcoal-400/30" />}
                            <span className="min-w-0 flex-1 text-xs text-offwhite">{value.value}</span>
                            <label className="cursor-pointer text-xs text-brand-red-light">Photo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={uploading} onChange={(event) => void uploadOptionValueImage(value.id, event)} /></label>
                            <button onClick={() => deleteOptionValue(value.id)} aria-label={`Retirer ${value.value}`}><X className="h-3 w-3" /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    <textarea rows={2} value={bulkValueDraft[option.id] ?? ''} onChange={(e) => setBulkValueDraft((prev) => ({ ...prev, [option.id]: e.target.value }))} className="input-field mt-2 resize-y text-sm" placeholder="Ajout multiple : Bleu, Noir, Blanc (ou une valeur par ligne)" />
                    <button type="button" onClick={() => void addOptionValuesBulk(option)} className="mt-2 text-xs text-brand-red-light">Ajouter toutes les valeurs</button>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={optionValueDraft[option.id] ?? ''}
                        onChange={(e) =>
                          setOptionValueDraft((prev) => ({ ...prev, [option.id]: e.target.value }))
                        }
                        onKeyDown={(e) =>
                          e.key === 'Enter' && (e.preventDefault(), addOptionValue(option))
                        }
                        className="input-field"
                        placeholder={`Valeur de ${option.name} (ex: Rouge)`}
                      />
                      <button type="button" onClick={() => addOptionValue(option)} className="btn-secondary px-3 text-xs">
                        Ajouter
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {options.some((o) => /^(forme|shape)$/i.test(o.name.trim())) && options.some((o) => /^(couleur|color|colour)$/i.test(o.name.trim())) && (
                <div className="mt-4 rounded-lg border border-brand-red/25 bg-brand-red/5 p-3">
                  <p className="text-sm font-semibold text-offwhite">Couleurs disponibles par forme</p>
                  <p className="mt-1 text-xs text-charcoal-400">Choisissez une forme puis cochez uniquement ses couleurs. Répétez pour chaque forme.</p>
                  <label className="mt-3 block"><span className="label-text">Forme</span><select value={selectedShapeId} onChange={(e) => { setSelectedShapeId(e.target.value); setSelectedColorIds([]) }} className="input-field"><option value="">Choisir...</option>{(options.find((o) => /^(forme|shape)$/i.test(o.name.trim()))?.values ?? []).map((v) => <option key={v.id} value={v.id}>{v.value}</option>)}</select></label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">{(options.find((o) => /^(couleur|color|colour)$/i.test(o.name.trim()))?.values ?? []).map((v) => <label key={v.id} className="flex items-center gap-2 rounded border border-charcoal-400/15 p-2 text-sm text-offwhite"><input type="checkbox" checked={selectedColorIds.includes(v.id)} onChange={(e) => setSelectedColorIds((current) => e.target.checked ? [...current,v.id] : current.filter((x) => x !== v.id))} className="accent-brand-red"/>{v.image_url ? <img src={v.image_url} alt="" className="h-8 w-8 rounded object-cover"/> : <span className="h-8 w-8 rounded border border-dashed border-charcoal-400/30"/>}{v.value}</label>)}</div>
                  <div className="mt-2 flex gap-3 text-xs"><button type="button" onClick={() => setSelectedColorIds((options.find((o) => /^(couleur|color|colour)$/i.test(o.name.trim()))?.values ?? []).map((v) => v.id))} className="text-brand-red-light">Tout sélectionner</button><button type="button" onClick={() => setSelectedColorIds([])} className="text-charcoal-400">Tout effacer</button></div>
                  <button type="button" onClick={() => void createSelectedShapeColorVariants()} disabled={creatingVariants || !selectedShapeId || !selectedColorIds.length} className="btn-primary mt-3">{creatingVariants ? 'Création...' : 'Créer les variantes sélectionnées'}</button>
                </div>
              )}
              {options.length > 0 && (
                <div className="mt-4 rounded-lg border border-charcoal-400/15 p-3">
                  <p className="text-sm font-semibold text-offwhite">Créer une variante</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {options.map((option) => (
                      <label key={option.id} className="block">
                        <span className="label-text">{option.name}</span>
                        <select
                          value={variantSelection[option.id] ?? ''}
                          onChange={(e) =>
                            setVariantSelection((prev) => ({ ...prev, [option.id]: e.target.value }))
                          }
                          className="input-field"
                        >
                          <option value="">Sélectionner...</option>
                          {(option.values ?? [])
                            .filter((value) => value.is_active)
                            .map((value) => (
                              <option key={value.id} value={value.id}>{value.value}</option>
                            ))}
                        </select>
                      </label>
                    ))}
                    <label className="block">
                      <span className="label-text">Prix de la variante (DA, optionnel)</span>
                      <input
                        type="number"
                        min={0}
                        value={variantPrice}
                        onChange={(e) => setVariantPrice(e.target.value)}
                        className="input-field"
                        placeholder="Vide = prix du produit"
                      />
                    </label>
                    <label className="block">
                      <span className="label-text">Stock de la variante</span>
                      <input
                        type="number"
                        min={0}
                        value={variantStock}
                        onChange={(e) => setVariantStock(e.target.value)}
                        className="input-field"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={createVariant}
                      disabled={!combinationComplete}
                      className="btn-primary"
                    >
                      <Plus className="h-4 w-4" />
                      Créer la variante
                    </button>
                    {options.length === 1 && (
                      <button
                        type="button"
                        onClick={() => void createVariantsForSingleOption()}
                        disabled={!(options[0].values ?? []).some((value) => value.is_active)}
                        className="btn-secondary"
                      >
                        Créer une variante par valeur
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void createAllVariantCombinations()}
                      disabled={creatingVariants || options.some((option) => !(option.values ?? []).some((value) => value.is_active))}
                      className="btn-secondary"
                    >
                      {creatingVariants ? 'Création en cours…' : 'Créer toutes les combinaisons'}
                    </button>
                  </div>
                  {options.length === 1 && (
                    <p className="mt-2 text-xs text-charcoal-500">
                      Le plus simple : une variante sera créée pour chaque valeur de « {options[0].name} ».
                      Le prix et le stock ci-dessus seront appliqués à toutes. Les variantes existantes seront conservées.
                    </p>
                  )}
                </div>
              )}

              {variants.length > 0 && (
                <div className="mt-4 space-y-2">
                  {variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-charcoal-400/15 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {variant.image_url ? (
                          <img src={variant.image_url} alt={variantLabel(variant)} className="h-14 w-14 rounded-lg border border-charcoal-400/20 object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-charcoal-400/30 text-[10px] text-charcoal-500">Photo</div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-offwhite">{variantLabel(variant)}</p>
                          <p className="text-xs text-charcoal-400">
                            {variant.price_dzd != null ? String(variant.price_dzd) + ' DA' : 'Prix du produit'} ·{' '}
                            {variant.stock_quantity} en stock
                            {!variant.is_active && ' · désactivée'}
                          </p>
                          <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs text-brand-red-light hover:text-brand-red">
                            <Upload className="h-3 w-3" />
                            {variant.image_url ? 'Modifier la photo' : 'Ajouter une photo'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/avif"
                              className="hidden"
                              disabled={uploading}
                              onChange={(event) => void handleVariantImageUpload(variant, event)}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleVariant(variant)}
                          className="text-xs text-charcoal-300 transition-colors hover:text-offwhite"
                        >
                          {variant.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteVariant(variant.id)}
                          className="text-charcoal-400 transition-colors hover:text-brand-red"
                          aria-label="Supprimer la variante"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Statut et visibilité</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-text">Statut</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as 'draft' | 'published' | 'archived' })}
                  className="input-field"
                >
                  <option value="draft">Brouillon</option>
                  <option value="published">Publié</option>
                  <option value="archived">Archivé</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-charcoal-200">
                  <input
                    type="checkbox"
                    checked={form.is_featured}
                    onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                    className="h-4 w-4 accent-brand-red"
                  />
                  Produit en vedette
                </label>
              </div>
            </div>
          </div>

          <details className="admin-card">
            <summary className="cursor-pointer list-none text-lg font-semibold text-offwhite">Paramètres avancés · SEO</summary>
            <div className="mt-4">
            <div className="space-y-4">
              <div>
                <label className="label-text">Titre SEO</label>
                <input
                  type="text"
                  value={form.seo_title}
                  onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
                  className="input-field"
                  placeholder="Titre pour les moteurs de recherche"
                />
              </div>
              <div>
                <label className="label-text">Description SEO</label>
                <textarea
                  value={form.seo_description}
                  onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
                  rows={2}
                  className="input-field resize-none"
                  maxLength={180}
                  placeholder="Description pour les moteurs de recherche"
                />
                <p className="mt-1 text-xs text-charcoal-500">Visez environ 150 à 160 caractères.</p>
              </div>
              <div>
                <label className="label-text">Mots-clés SEO (séparés par des virgules)</label>
                <input type="text" value={form.seo_keywords} onChange={(e) => setForm({ ...form, seo_keywords: e.target.value })} className="input-field" placeholder="impression 3D, accessoire, Algérie" />
              </div>
            </div>
            </div>
          </details>
        </div>

        <div className="space-y-6">
          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Photos du produit</h2>
            {!isNew && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary w-full"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Ajouter des photos
                </button>
                <p className="mt-2 text-xs text-charcoal-500">
                  Photos propres à ce produit · JPEG, PNG, WebP ou AVIF · 5 Mo maximum par photo.
                  Chaque image est enregistrée dans sa galerie et ne remplace pas les photos des autres produits.
                </p>
                {images.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {images.map((img) => (
                      <div key={img.id} className="relative group overflow-hidden rounded-lg border border-charcoal-400/15">
                        <img
                          src={img.image_url}
                          alt={img.alt_text ?? ''}
                          loading="lazy"
                          className="h-32 w-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          {!img.is_primary && (
                            <button
                              onClick={() => setPrimaryImage(img.id)}
                              className="rounded-md bg-charcoal-800 p-2 text-charcoal-200 hover:text-brand-red"
                              aria-label="Définir comme principale"
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteImage(img.id, img.image_url)}
                            className="rounded-md bg-charcoal-800 p-2 text-charcoal-200 hover:text-brand-red"
                            aria-label="Supprimer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {img.is_primary && (
                          <span className="absolute bottom-1 left-1 rounded bg-brand-red px-1.5 py-0.5 text-[10px] font-medium text-white">
                            Principale
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {images.length === 0 && (
                  <p className="mt-3 text-xs text-charcoal-500">Enregistrez d'abord le produit pour ajouter des photos.</p>
                )}
              </>
            )}
            {isNew && <p className="text-xs text-charcoal-500">Enregistrez le produit pour pouvoir ajouter des photos.</p>}
          </div>

          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Modèle 3D (GLB/GLTF)</h2>
            {!isNew && (
              <>
                <input
                  ref={modelInputRef}
                  type="file"
                  accept=".glb,.gltf"
                  onChange={handleModelUpload}
                  className="hidden"
                />
                <button
                  onClick={() => modelInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary w-full"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {form.model_url ? 'Remplacer le modèle' : 'Ajouter un modèle 3D'}
                </button>
                <p className="mt-2 text-xs text-charcoal-500">
                  GLB recommandé (25 Mo maximum). Un GLTF n'est accepté que si ses ressources sont intégrées.
                </p>
                {form.model_url && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-charcoal-400/15 p-3">
                    <p className="text-xs text-green-400">Modèle 3D téléversé</p>
                    <button type="button" onClick={() => void deleteModel()} className="inline-flex items-center gap-1 rounded-md bg-charcoal-800 px-3 py-2 text-xs text-brand-red-light hover:bg-charcoal-700"><Trash2 className="h-4 w-4" /> Supprimer le modèle</button>
                  </div>
                )}
              </>
            )}
            {isNew && <p className="text-xs text-charcoal-500">Enregistrez le produit pour pouvoir ajouter un modèle 3D.</p>}
          </div>

          <button onClick={() => handleSave()} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
          {form.status !== 'published' && (
            <button onClick={() => handleSave(true)} disabled={saving} className="btn-secondary mt-2 w-full">
              <Save className="h-4 w-4" />
              Enregistrer et publier
            </button>
          )}
        </div>
      </div>
    </div>
  )
}