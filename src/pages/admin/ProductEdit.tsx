import { useEffect, useState, useRef } from 'react'
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
import ProductCostCard from '@/components/admin/ProductCostCard'

export default function AdminProductEdit() {
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
  const [colors, setColors] = useState<string[]>([])
  const [colorInput, setColorInput] = useState('')

  const [options, setOptions] = useState<ProductOption[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [newOptionName, setNewOptionName] = useState('')
  const [optionValueDraft, setOptionValueDraft] = useState<Record<string, string>>({})
  const [variantSelection, setVariantSelection] = useState<Record<string, string>>({})
  const [variantPrice, setVariantPrice] = useState('')
  const [variantStock, setVariantStock] = useState('0')

  const [form, setForm] = useState({
    name: '',
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
      })
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
        if (upErr) throw new Error(`« ${file.name} » a été refusé par le stockage (format ou taille).`)

        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
        const isPrimary = images.length === 0 && i === 0
        const { data: imgData } = await supabase
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
        if (imgData) setImages((prev) => [...prev, imgData as ProductImage])
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

      if (previousPath) {
        await supabase.storage.from('product-models').remove([previousPath])
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
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', id)
    await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId)
    setImages((prev) => prev.map((img) => ({ ...img, is_primary: img.id === imageId })))
  }

  const deleteImage = async (imageId: string, imageUrl: string) => {
    const path = imageUrl.split('/product-images/')[1]
    if (path) await supabase.storage.from('product-images').remove([path])
    await supabase.from('product_images').delete().eq('id', imageId)
    setImages((prev) => prev.filter((img) => img.id !== imageId))
  }

  const addColor = () => {
    const c = colorInput.trim()
    if (c && !colors.includes(c)) setColors([...colors, c])
    setColorInput('')
  }

  const removeColor = (c: string) => setColors(colors.filter((x) => x !== c))

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
    if (!confirm('Supprimer cette option et ses valeurs ? Les variantes concernées perdront ce choix.')) return
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

  const handleSave = async () => {
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
      const slug = slugify(form.name)
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
        status: form.status,
        is_featured: form.is_featured,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
      }

      if (isNew) {
        const { data, error: insErr } = await supabase.from('products').insert(payload).select('*').single()
        if (insErr) throw insErr
        navigate(`/admin/produits/${(data as Product).id}`, { replace: true })
      } else if (id) {
        const { error: upErr } = await supabase.from('products').update(payload).eq('id', id)
        if (upErr) throw upErr
      }
    } catch {
      setError("Erreur lors de l'enregistrement. Vérifiez les champs.")
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

      <h1 className="mb-6 text-2xl font-bold text-offwhite">
        {isNew ? 'Nouveau produit' : 'Modifier le produit'}
      </h1>

      {error && (
        <div className="mb-6 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red-light">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
              <div>
                <label className="label-text">SKU</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="input-field"
                  placeholder="Auto-généré si vide"
                />
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

          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Caractéristiques</h2>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
                <label className="label-text">Couleurs disponibles</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={colorInput}
                    onChange={(e) => setColorInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addColor())}
                    className="input-field"
                    placeholder="Ajouter une couleur..."
                  />
                  <button type="button" onClick={addColor} className="btn-secondary px-4">Ajouter</button>
                </div>
                {colors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {colors.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-charcoal-700 px-3 py-1 text-xs text-offwhite">
                        {c}
                        <button onClick={() => removeColor(c)} aria-label="Retirer">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {!isNew && (
            <div className="admin-card">
              <h2 className="mb-1 text-lg font-semibold text-offwhite">Options et variantes</h2>
              <p className="mb-4 text-xs text-charcoal-400">
                Créez une option (par exemple « Couleur »), ses valeurs, puis chaque combinaison réellement
                fabricable. Aucune combinaison n'est générée automatiquement.
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
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(option.values ?? []).map((value) => (
                          <span key={value.id} className="inline-flex items-center gap-1.5 rounded-full bg-charcoal-700 px-3 py-1 text-xs text-offwhite">
                            {value.value}
                            <button onClick={() => deleteOptionValue(value.id)} aria-label={`Retirer ${value.value}`}>
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

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
                  <button
                    type="button"
                    onClick={createVariant}
                    disabled={!combinationComplete}
                    className="btn-primary mt-3"
                  >
                    <Plus className="h-4 w-4" />
                    Créer la variante
                  </button>
                </div>
              )}

              {variants.length > 0 && (
                <div className="mt-4 space-y-2">
                  {variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-charcoal-400/15 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-offwhite">{variantLabel(variant)}</p>
                        <p className="text-xs text-charcoal-400">
                          {variant.price_dzd != null ? `${variant.price_dzd} DA` : 'Prix du produit'} ·{' '}
                          {variant.stock_quantity} en stock
                          {!variant.is_active && ' · désactivée'}
                        </p>
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

          {!isNew && id && <ProductCostCard productId={id} />}

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

          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">SEO</h2>
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
                  placeholder="Description pour les moteurs de recherche"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Photos</h2>
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
                  JPEG, PNG, WebP ou AVIF · 5 Mo maximum par photo.
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
                  <p className="mt-2 text-xs text-green-400">Modèle 3D téléversé</p>
                )}
              </>
            )}
            {isNew && <p className="text-xs text-charcoal-500">Enregistrez le produit pour pouvoir ajouter un modèle 3D.</p>}
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
