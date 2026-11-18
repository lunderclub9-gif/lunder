import { useCallback, useEffect, useState } from 'react'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { Plus, Trash2, Pencil, Tag, X, Loader2 } from 'lucide-react'
import { supabase, type Category } from '@/lib/supabase'
import { slugify } from '@/lib/format'
import posthog, { isPostHogEnabled } from '@/lib/posthog'

export default function AdminCategories() {
  const confirmAction = useAdminConfirm()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('categories').select('*').order('sort_order')
    if (queryError) setError('Impossible de charger les catégories.')
    else { setError(null); setCategories((data as Category[]) ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => { void loadCategories() }, [loadCategories])

  const resetForm = () => {
    setName('')
    setDescription('')
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = name.trim()
    const slug = slugify(cleanName)
    if (cleanName.length < 2 || !slug) {
      setError('Le nom de catégorie doit contenir au moins 2 caractères valides.')
      return
    }
    setError(null)
    setSaving(true)
    const result = editingId
      ? await supabase.from('categories').update({ name: cleanName, slug, description: description.trim() || null }).eq('id', editingId)
      : await supabase.from('categories').insert({ name: cleanName, slug, description: description.trim() || null, sort_order: categories.length })
    setSaving(false)
    if (result.error) {
      setError(result.error.code === '23505' ? 'Une catégorie avec ce nom ou cet identifiant existe déjà.' : 'Impossible d’enregistrer la catégorie.')
      return
    }
    if (isPostHogEnabled) posthog.capture(editingId ? 'category_updated' : 'category_created', editingId ? { category_id: editingId } : undefined)
    resetForm()
    await loadCategories()
  }

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id)
    setName(cat.name)
    setDescription(cat.description ?? '')
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ title: 'Supprimer cette catégorie ?', description: 'Cette catégorie sera supprimée. Vérifiez les produits qui lui sont associés avant de continuer.', confirmLabel: 'Supprimer la catégorie', tone: 'danger' }))) return
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.code === '23503' ? 'Cette catégorie est encore utilisée par des produits. Réaffectez ces produits avant de la supprimer.' : 'Impossible de supprimer cette catégorie.')
      return
    }
    setError(null)
    if (isPostHogEnabled) posthog.capture('category_deleted', { category_id: id })
    await loadCategories()
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="admin-eyebrow">Organisation du catalogue</p><h1 className="text-2xl font-bold text-offwhite">Catégories</h1><p className="mt-1 text-xs text-charcoal-500">{categories.length} catégorie(s)</p></div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="h-4 w-4" />
          {showForm ? 'Annuler' : 'Ajouter une catégorie'}
        </button>
      </div>

      {error && <div role="alert" className="admin-feedback admin-feedback-error mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 admin-card animate-slide-up">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-text">Nom *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="Ex: Décorations"
                autoFocus
                maxLength={80}
                required
              />
            </div>
            <div>
              <label className="label-text">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
                placeholder="Description courte"
                maxLength={300}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
            </button>
            <button type="button" onClick={resetForm} className="btn-ghost">
              <X className="h-4 w-4" />
              Annuler
            </button>
          </div>
        </form>
      )}

      {categories.length === 0 ? (
        <div className="admin-card text-center py-16">
          <Tag className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">Aucune catégorie pour le moment.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <div key={cat.id} className="admin-card group">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-offwhite">{cat.name}</h3>
                  <p className="mt-1 text-xs text-charcoal-400">{cat.description ?? 'Aucune description'}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => handleEdit(cat)} className="btn-ghost text-xs">
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </button>
                <button onClick={() => handleDelete(cat.id)} className="btn-ghost text-xs hover:text-brand-red">
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
