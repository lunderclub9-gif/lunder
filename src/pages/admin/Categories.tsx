import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, Tag, X, Loader2 } from 'lucide-react'
import { supabase, type Category } from '@/lib/supabase'
import { slugify } from '@/lib/format'

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').order('sort_order')
    setCategories((data as Category[]) ?? [])
    setLoading(false)
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const slug = slugify(name)
    if (editingId) {
      await supabase.from('categories').update({ name: name.trim(), slug, description: description || null }).eq('id', editingId)
    } else {
      await supabase.from('categories').insert({ name: name.trim(), slug, description: description || null, sort_order: categories.length })
    }
    resetForm()
    await loadCategories()
    setSaving(false)
  }

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id)
    setName(cat.name)
    setDescription(cat.description ?? '')
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette catégorie ?')) return
    await supabase.from('categories').delete().eq('id', id)
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
        <h1 className="text-2xl font-bold text-offwhite">Catégories</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="h-4 w-4" />
          {showForm ? 'Annuler' : 'Ajouter une catégorie'}
        </button>
      </div>

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
