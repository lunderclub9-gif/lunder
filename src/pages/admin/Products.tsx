import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Search, Package, Trash2, Loader2 } from 'lucide-react'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { supabase, type Product } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const confirmAction = useAdminConfirm()

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .order('created_at', { ascending: false })
    setProducts((data as Product[]) ?? [])
    setLoading(false)
  }

  const deleteProduct = async (product: Product) => {
    if (!(await confirmAction({ title: `Supprimer « ${product.name} » ?`, description: 'Cette action supprime définitivement le produit et ses médias associés. Les lignes de commandes historiques conservent leur instantané.', confirmLabel: 'Supprimer le produit', tone: 'danger' }))) return
    setDeletingId(product.id)
    const { data: imageFiles, error: imageListError } = await supabase.storage.from('product-images').list(product.id, { limit: 1000 })
    const { data: modelFiles, error: modelListError } = await supabase.storage.from('product-models').list(product.id, { limit: 1000 })
    if (imageListError || modelListError) {
      window.alert('Impossible de préparer la suppression des médias. Le produit n’a pas été supprimé.')
      setDeletingId(null)
      return
    }
    const { error: deleteError } = await supabase.from('products').delete().eq('id', product.id)
    if (deleteError) {
      window.alert('Impossible de supprimer le produit. Vérifiez les dépendances et les autorisations.')
      setDeletingId(null)
      return
    }
    setProducts((current) => current.filter((item) => item.id !== product.id))
    const imagePaths = (imageFiles ?? []).map((file) => `${product.id}/${file.name}`)
    const modelPaths = (modelFiles ?? []).map((file) => `${product.id}/${file.name}`)
    const [imageCleanup, modelCleanup] = await Promise.all([
      imagePaths.length ? supabase.storage.from('product-images').remove(imagePaths) : Promise.resolve({ error: null }),
      modelPaths.length ? supabase.storage.from('product-models').remove(modelPaths) : Promise.resolve({ error: null }),
    ])
    if (imageCleanup.error || modelCleanup.error) {
      window.alert('Le produit a été supprimé, mais certains fichiers de stockage n’ont pas pu être nettoyés. Un nettoyage manuel du dossier du produit est nécessaire.')
    }
    setDeletingId(null)
  }

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const statusLabels: Record<string, string> = {
    draft: 'Brouillon',
    published: 'Publié',
    archived: 'Archivé',
  }
  const statusColors: Record<string, string> = {
    draft: 'bg-charcoal-600 text-charcoal-200',
    published: 'bg-green-600/20 text-green-400',
    archived: 'bg-yellow-600/20 text-yellow-400',
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-offwhite">Produits</h1>
        <Link to="/admin/produits/nouveau" className="btn-primary">
          <Plus className="h-4 w-4" />
          Ajouter un produit
        </Link>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
        <input
          type="text"
          placeholder="Rechercher un produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Package className="h-8 w-8 animate-pulse text-charcoal-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-card text-center py-16">
          <Package className="mx-auto mb-4 h-12 w-12 text-charcoal-500" />
          <p className="text-charcoal-400">Aucun produit pour le moment.</p>
          <Link to="/admin/produits/nouveau" className="btn-primary mt-4">
            <Plus className="h-4 w-4" />
            Créer le premier produit
          </Link>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-charcoal-400/15 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-charcoal-400/15 bg-charcoal-800/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-charcoal-300">Produit</th>
                  <th className="px-4 py-3 font-semibold text-charcoal-300">SKU</th>
                  <th className="px-4 py-3 font-semibold text-charcoal-300">Catégorie</th>
                  <th className="px-4 py-3 font-semibold text-charcoal-300">Prix</th>
                  <th className="px-4 py-3 font-semibold text-charcoal-300">Statut</th>
                  <th className="px-4 py-3 font-semibold text-charcoal-300">Stock</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-400/10">
                {filtered.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-charcoal-800/30">
                    <td className="px-4 py-3 font-medium text-offwhite">{p.name}</td>
                    <td className="px-4 py-3 text-charcoal-300">{p.sku}</td>
                    <td className="px-4 py-3 text-charcoal-300">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-offwhite">{formatDzd(p.price_dzd)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>
                        {statusLabels[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-charcoal-300">
                      {p.made_to_order ? 'Sur commande' : p.stock_quantity}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/produits/${p.id}`}
                        className="inline-flex items-center gap-1 text-charcoal-300 transition-colors hover:text-brand-red"
                      >
                        <Pencil className="h-4 w-4" />
                        Modifier
                      </Link>
                      <button type="button" onClick={() => void deleteProduct(p)} disabled={deletingId === p.id} className="ml-3 inline-flex items-center gap-1 text-brand-red-light transition-colors hover:text-red-300 disabled:opacity-50" aria-label={`Supprimer ${p.name}`}>
                        {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {filtered.map((p) => (
              <div key={p.id} className="admin-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-offwhite">{p.name}</h3>
                    <p className="text-xs text-charcoal-400">{p.sku}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>
                    {statusLabels[p.status]}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-semibold text-offwhite">{formatDzd(p.price_dzd)}</span>
                  <Link
                    to={`/admin/produits/${p.id}`}
                    className="inline-flex items-center gap-1 text-sm text-charcoal-300 hover:text-brand-red"
                  >
                    <Pencil className="h-4 w-4" />
                    Modifier
                  </Link>
                  <button type="button" onClick={() => void deleteProduct(p)} disabled={deletingId === p.id} className="inline-flex items-center gap-1 text-sm text-brand-red-light disabled:opacity-50" aria-label={`Supprimer ${p.name}`}>
                    {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
