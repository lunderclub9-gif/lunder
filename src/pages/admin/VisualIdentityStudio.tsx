import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clock3, ImagePlus, Loader2, Palette, RotateCcw, Save, Sparkles, Undo2, Upload, WandSparkles, ArrowRight } from 'lucide-react'
import LiveStorePreview from '@/components/admin/LiveStorePreview'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { validateImage } from '@/lib/media'
import { contrastRatio, DEFAULT_VISUAL_IDENTITY, parseVisualIdentity, VISUAL_PRESETS, type VisualIdentity } from '@/lib/visual-identity'

const COLOR_FIELDS: { key: keyof VisualIdentity['colors']; label: string }[] = [
  { key: 'primary', label: 'Couleur principale' }, { key: 'secondary', label: 'Couleur secondaire' },
  { key: 'accent', label: 'Couleur accent' }, { key: 'background', label: 'Arrière-plan' },
  { key: 'surface', label: 'Cartes et surfaces' }, { key: 'surfaceAlt', label: 'Surface secondaire' },
  { key: 'text', label: 'Texte principal' }, { key: 'muted', label: 'Texte secondaire' },
  { key: 'border', label: 'Bordures' }, { key: 'header', label: 'En-tête' },
  { key: 'footer', label: 'Pied de page' }, { key: 'buttonText', label: 'Texte des boutons' },
  { key: 'glow', label: 'Éclairage 3D' }, { key: 'gradientStart', label: 'Dégradé — début' },
  { key: 'gradientEnd', label: 'Dégradé — fin' },
]
const ASSET_FIELDS: { key: keyof VisualIdentity['assets']; label: string; hint: string }[] = [
  { key: 'logo', label: 'Logo principal', hint: 'En-tête et pied de page' },
  { key: 'mobileLogo', label: 'Logo mobile', hint: 'Variante compacte' },
  { key: 'heroImage', label: 'Visuel de couverture', hint: 'Panneau visuel de l’accueil' },
  { key: 'footerImage', label: 'Visuel du pied de page', hint: 'Illustration facultative' },
]
const SECTION_FIELDS: { key: keyof VisualIdentity['sections']; label: string; detail: string }[] = [
  { key: 'benefits', label: 'Avantages', detail: 'Cartes de confiance' },
  { key: 'featured', label: 'Produits à la une', detail: 'Produits mis en avant' },
  { key: 'categories', label: 'Catégories', detail: 'Univers de la boutique' },
  { key: 'process', label: 'Parcours en 3 étapes', detail: 'Comment ça fonctionne' },
  { key: 'custom', label: 'Fabrication sur mesure', detail: 'Présentation du service' },
  { key: 'latest', label: 'Nouveautés', detail: 'Derniers produits publiés' },
  { key: 'finalCta', label: 'Bannière finale', detail: 'Appel à découvrir la boutique' },
]
type Version = { id: number; created_at: string }

export default function VisualIdentityStudio() {
  const { profile } = useAuth()
  const confirmAction = useAdminConfirm()
  const [config, setConfig] = useState<VisualIdentity>(DEFAULT_VISUAL_IDENTITY)
  const [past, setPast] = useState<VisualIdentity[]>([])
  const [future, setFuture] = useState<VisualIdentity[]>([])
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hexDraft, setHexDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error: settingsError }, { data: history, error: historyError }] = await Promise.all([
      supabase.from('store_settings').select('key,value,is_public').in('key', ['visual_identity', 'visual_identity_draft']),
      supabase.from('store_design_versions').select('id,created_at').order('created_at', { ascending: false }).limit(8),
    ])
    if (settingsError || historyError) {
      setError('Impossible de charger les réglages ou l’historique. Vérifiez votre accès propriétaire puis réessayez.')
      setLoading(false)
      return
    }
    setError('')
    const rows = (data ?? []) as { key: string; value: string | null }[]
    const draft = rows.find((row) => row.key === 'visual_identity_draft')
    const published = rows.find((row) => row.key === 'visual_identity')
    setConfig(parseVisualIdentity(draft?.value ?? published?.value))
    setVersions((history ?? []) as Version[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const update = (next: VisualIdentity) => {
    setPast((items) => [...items.slice(-29), config])
    setFuture([])
    setConfig(next)
    setMessage('')
  }
  const updateColor = (key: keyof VisualIdentity['colors'], value: string) =>
    update({ ...config, colors: { ...config.colors, [key]: value }, preset: 'custom' })
  const applyPreset = (id: string) => {
    const preset = VISUAL_PRESETS.find((item) => item.id === id)
    if (preset) update({ ...config, preset: preset.id, colors: { ...preset.colors } })
  }

  const saveDraft = async () => {
    setSaving(true); setError(''); setMessage('')
    const { error: writeError } = await supabase.from('store_settings').upsert({
      key: 'visual_identity_draft', value: JSON.stringify(config), is_public: false,
    }, { onConflict: 'key' })
    setSaving(false)
    if (writeError) { setError('Échec de l’enregistrement du brouillon.'); return }
    setMessage('Brouillon enregistré. Les visiteurs ne voient pas ces changements.')
  }

  const contrastWarnings = useMemo(() => {
    const warnings: string[] = []
    if (contrastRatio(config.colors.text, config.colors.background) < 4.5) warnings.push('Le texte principal manque de contraste avec le fond.')
    if (contrastRatio(config.colors.buttonText, config.colors.primary) < 4.5) warnings.push('Le texte des boutons manque de contraste avec la couleur principale.')
    return warnings
  }, [config.colors])

  const publish = async () => {
    setError(''); setMessage('')
    const invalid = COLOR_FIELDS.find(({ key }) => !/^#[0-9a-f]{6}$/i.test(config.colors[key]))
    if (invalid) { setError('La couleur ' + invalid.label + ' doit être un code HEX #RRGGBB valide.'); return }
    if (contrastWarnings.length) { setError('Corrigez les problèmes de contraste avant publication.'); return }
    const publishAccepted = await confirmAction({
      title: 'Publier ce thème ?',
      description: 'Les couleurs, médias, contenus et réglages de mouvement deviendront visibles immédiatement par les visiteurs. Le brouillon reste conservé.',
      confirmLabel: 'Publier sur la boutique',
    })
    if (!publishAccepted) return
    setSaving(true)
    const { error: draftError } = await supabase.from('store_settings').upsert({
      key: 'visual_identity_draft', value: JSON.stringify(config), is_public: false,
    }, { onConflict: 'key' })
    if (draftError) { setSaving(false); setError('Impossible de sauvegarder le brouillon avant publication.'); return }
    const { error: publishError } = await supabase.rpc('publish_visual_identity', { p_config: config })
    setSaving(false)
    if (publishError) { setError('La publication a échoué. Le brouillon reste sauvegardé.'); return }
    setMessage('Design publié. La boutique publique utilisera cette identité.')
    const { data: history } = await supabase.from('store_design_versions').select('id,created_at').order('created_at', { ascending: false }).limit(8)
    setVersions((history ?? []) as Version[])
  }

  const restoreVersion = async (id: number) => {
    const restoreAccepted = await confirmAction({
      title: 'Restaurer cette version ?',
      description: `La version #${id} deviendra l’identité publique actuelle. Une nouvelle entrée est ajoutée à l’historique : rien n’est effacé.`,
      confirmLabel: 'Restaurer et publier',
    })
    if (!restoreAccepted) return
    setSaving(true); setError(''); setMessage('')
    const { error: restoreError } = await supabase.rpc('restore_visual_identity_version', { p_version_id: id })
    setSaving(false)
    if (restoreError) { setError('Impossible de restaurer cette version.'); return }
    const { data: current, error: currentError } = await supabase
      .from('store_settings')
      .select('value')
      .eq('key', 'visual_identity')
      .maybeSingle()
    if (currentError || !current?.value) {
      setError('La version a été publiée, mais le studio n’a pas pu relire le thème public. Actualisez la page avant toute autre modification.')
      return
    }
    const restored = parseVisualIdentity(current.value)
    const { error: draftError } = await supabase.from('store_settings').upsert(
      { key: 'visual_identity_draft', value: JSON.stringify(restored), is_public: false },
      { onConflict: 'key' },
    )
    setConfig(restored)
    if (draftError) {
      setError('La version publique a bien été restaurée, mais le brouillon privé n’a pas pu être synchronisé. Enregistrez le brouillon à nouveau.')
      return
    }
    setMessage('Version restaurée et publiée. Le brouillon est synchronisé.')
    await load()
  }

  const uploadAsset = async (key: keyof VisualIdentity['assets'], file?: File) => {
    if (!file || !profile?.id) return
    setUploading(key); setError(''); setMessage('')
    const checked = await validateImage(file)
    if (!checked.ok) { setUploading(null); setError(checked.message); return }
    const path = 'visual-identity/' + profile.id + '/' + key + '-' + Date.now() + '.' + checked.extension
    const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file, {
      contentType: checked.contentType, cacheControl: '31536000', upsert: false,
    })
    setUploading(null)
    if (uploadError) { setError('Téléversement impossible. Vérifiez le bucket product-images et les droits du propriétaire.'); return }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    update({ ...config, assets: { ...config.assets, [key]: data.publicUrl } })
    setMessage('Image ajoutée au brouillon. Enregistrez puis publiez pour la rendre visible.')
  }

  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-red" /></div>

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div><p className="admin-eyebrow">LUNDER / CREATIVE CONTROL</p><h1 className="text-2xl font-bold text-offwhite sm:text-3xl">Visual Identity Studio</h1><p className="mt-2 max-w-2xl text-sm text-charcoal-400">Contrôlez les couleurs, les médias, les contenus de l’accueil et le mouvement du site. Les brouillons restent privés jusqu’à publication.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" disabled={!past.length} onClick={() => { const item = past[past.length - 1]; setPast((items) => items.slice(0, -1)); setFuture((items) => [...items, config]); setConfig(item) }}><Undo2 className="h-4 w-4" /> Annuler</button>
          <button type="button" className="btn-ghost" disabled={!future.length} onClick={() => { const item = future[future.length - 1]; setFuture((items) => items.slice(0, -1)); setPast((items) => [...items, config]); setConfig(item) }}><ArrowRight className="h-4 w-4" /> Rétablir</button>
          <button type="button" className="btn-secondary" onClick={() => update(structuredClone(DEFAULT_VISUAL_IDENTITY))}><RotateCcw className="h-4 w-4" /> Valeurs initiales</button>
          <button type="button" className="btn-secondary" onClick={() => void saveDraft()} disabled={saving}><Save className="h-4 w-4" /> Brouillon</button>
          <button type="button" className="btn-primary" onClick={() => void publish()} disabled={saving}><Sparkles className="h-4 w-4" /> Publier</button>
        </div>
      </header>
      {error && <div role="alert" className="admin-feedback admin-feedback-error">{error}</div>}
      {message && <div role="status" className="admin-feedback admin-feedback-success">{message}</div>}

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-5">
          <section className="admin-card">
            <div className="mb-4 flex items-center gap-2"><WandSparkles className="h-5 w-5 text-brand-red-light" /><h2 className="text-lg font-semibold text-offwhite">Thèmes de départ</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{VISUAL_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} className={'rounded-xl border p-3 text-left transition ' + (config.preset === preset.id ? 'border-brand-red bg-brand-red/10' : 'border-charcoal-400/20 hover:border-charcoal-300')}><div className="mb-3 flex gap-1.5">{[preset.colors.background, preset.colors.primary, preset.colors.accent, preset.colors.surface].map((color) => <span key={color} className="h-6 flex-1 rounded-md border border-white/10" style={{ backgroundColor: color }} />)}</div><span className="block text-sm font-semibold text-offwhite">{preset.name}</span><span className="mt-1 block text-xs text-charcoal-400">{preset.description}</span></button>)}</div>
          </section>

          <section className="admin-card">
            <div className="mb-4 flex items-center gap-2"><Palette className="h-5 w-5 text-brand-red-light" /><h2 className="text-lg font-semibold text-offwhite">Couleurs globales</h2></div>
            <div className="grid gap-4 sm:grid-cols-2">{COLOR_FIELDS.map(({ key, label }) => <div key={key} className="flex items-end gap-3"><label className="block min-w-0 flex-1"><span className="label-text">{label}</span><input className="input-field font-mono uppercase" value={hexDraft[key] ?? config.colors[key]} onChange={(event) => { const value = event.target.value; setHexDraft((current) => ({ ...current, [key]: value })); if (/^#[0-9a-f]{6}$/i.test(value)) updateColor(key, value) }} onBlur={() => setHexDraft((current) => ({ ...current, [key]: config.colors[key] }))} maxLength={7} /></label><input aria-label={'Choisir ' + label} type="color" value={/^#[0-9a-f]{6}$/i.test(config.colors[key]) ? config.colors[key] : '#000000'} onChange={(event) => { setHexDraft((current) => ({ ...current, [key]: event.target.value })); updateColor(key, event.target.value) }} className="h-11 w-14 cursor-pointer rounded-lg border border-charcoal-400/30 bg-charcoal-900 p-1" /></div>)}</div>
            <div className="mt-5 rounded-lg border border-charcoal-400/20 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-charcoal-300">Contraste et lisibilité</p>{contrastWarnings.length ? contrastWarnings.map((warning) => <p key={warning} className="text-xs text-amber-300">• {warning}</p>) : <p className="flex items-center gap-2 text-xs text-emerald-300"><Check className="h-4 w-4" /> Contraste minimum recommandé atteint.</p>}</div>
          </section>

          <section className="admin-card">
            <div className="mb-4 flex items-center gap-2"><ImagePlus className="h-5 w-5 text-brand-red-light" /><h2 className="text-lg font-semibold text-offwhite">Logo et médias</h2></div>
            <p className="mb-4 text-xs text-charcoal-400">PNG, JPG, WebP et AVIF — maximum 5 Mo. Les fichiers sont vérifiés par signature binaire puis envoyés dans le bucket existant product-images. Les SVG actifs ne sont pas acceptés afin d’éviter les scripts embarqués.</p>
            <div className="grid gap-4 sm:grid-cols-2">{ASSET_FIELDS.map(({ key, label, hint }) => <div key={key} className="rounded-xl border border-charcoal-400/20 p-3"><div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold text-offwhite">{label}</p><p className="text-xs text-charcoal-500">{hint}</p></div>{config.assets[key] && <button type="button" onClick={() => update({ ...config, assets: { ...config.assets, [key]: '' } })} className="text-xs text-red-300">Retirer</button>}</div>{config.assets[key] ? <img src={config.assets[key]} alt={label} className="mb-3 max-h-28 w-full rounded-lg object-contain" loading="lazy" /> : <div className="mb-3 flex h-24 items-center justify-center rounded-lg border border-dashed border-charcoal-400/30 text-xs text-charcoal-500">Aucun fichier</div>}<label className="btn-secondary w-full cursor-pointer"><Upload className="h-4 w-4" />{uploading === key ? 'Envoi…' : 'Téléverser / remplacer'}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={!!uploading} onChange={(event) => { void uploadAsset(key, event.target.files?.[0]); event.currentTarget.value = '' }} /></label></div>)}</div>
          </section>

          <section className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Contenu de la page d’accueil</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['heroTitle', 'Titre principal'], ['heroHighlight', 'Ligne mise en valeur'], ['primaryButton', 'Bouton principal'], ['secondaryButton', 'Bouton secondaire'],
                ['featuredTitle', 'Titre produits à la une'], ['categoriesTitle', 'Titre catégories'], ['processTitle', 'Titre parcours'], ['customTitle', 'Titre sur mesure'], ['latestTitle', 'Titre nouveautés'], ['ctaTitle', 'Titre bannière finale'],
              ] as const).map(([key, label]) => <label key={key}><span className="label-text">{label}</span><input className="input-field" value={config.content[key]} onChange={(event) => update({ ...config, content: { ...config.content, [key]: event.target.value } })} maxLength={140} /></label>)}
              {(['heroDescription', 'ctaDescription'] as const).map((key) => <label key={key} className="sm:col-span-2"><span className="label-text">{key === 'heroDescription' ? 'Description principale' : 'Description bannière finale'}</span><textarea className="input-field min-h-24" value={config.content[key]} onChange={(event) => update({ ...config, content: { ...config.content, [key]: event.target.value } })} maxLength={500} /></label>)}
            </div>
            <div className="mt-5 space-y-3 border-t border-charcoal-400/15 pt-4"><h3 className="text-sm font-semibold text-offwhite">Sections visibles</h3>{SECTION_FIELDS.map(({ key, label, detail }) => <label key={key} className="flex items-center justify-between gap-4 rounded-lg border border-charcoal-400/15 p-3"><span><span className="block text-sm text-offwhite">{label}</span><span className="block text-xs text-charcoal-500">{detail}</span></span><input type="checkbox" checked={config.sections[key]} onChange={(event) => update({ ...config, sections: { ...config.sections, [key]: event.target.checked } })} className="h-4 w-4 accent-brand-red" /></label>)}</div>
          </section>

          <section className="admin-card">
            <h2 className="mb-4 text-lg font-semibold text-offwhite">Typographie et formes</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label-text">Police des titres</span><select className="input-field" value={config.typography.headingFont} onChange={(event) => update({ ...config, typography: { ...config.typography, headingFont: event.target.value } })}><option>Inter</option><option>Arial</option><option>system-ui</option><option>Georgia</option></select></label>
              <label><span className="label-text">Police du texte</span><select className="input-field" value={config.typography.bodyFont} onChange={(event) => update({ ...config, typography: { ...config.typography, bodyFont: event.target.value } })}><option>Inter</option><option>Arial</option><option>system-ui</option><option>Georgia</option></select></label>
              <label><span className="label-text">Taille de base ({config.typography.baseSize}px)</span><input type="range" min="14" max="20" value={config.typography.baseSize} onChange={(event) => update({ ...config, typography: { ...config.typography, baseSize: Number(event.target.value) } })} className="w-full accent-brand-red" /></label>
              <label><span className="label-text">Graisse des titres ({config.typography.headingWeight})</span><input type="range" min="600" max="900" step="100" value={config.typography.headingWeight} onChange={(event) => update({ ...config, typography: { ...config.typography, headingWeight: Number(event.target.value) } })} className="w-full accent-brand-red" /></label>
              <label><span className="label-text">Arrondi des cartes ({config.shape.radius}px)</span><input type="range" min="4" max="32" value={config.shape.radius} onChange={(event) => update({ ...config, shape: { ...config.shape, radius: Number(event.target.value) } })} className="w-full accent-brand-red" /></label>
              <label><span className="label-text">Arrondi des boutons ({config.shape.buttonRadius}px)</span><input type="range" min="0" max="28" value={config.shape.buttonRadius} onChange={(event) => update({ ...config, shape: { ...config.shape, buttonRadius: Number(event.target.value) } })} className="w-full accent-brand-red" /></label>
            </div>
          </section>

          <section className="admin-card">
            <div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-red-light" /><h2 className="text-lg font-semibold text-offwhite">Système 3D et mouvement</h2></div>
            <label className="mb-4 flex items-center justify-between rounded-lg border border-charcoal-400/15 p-3"><span><span className="block text-sm text-offwhite">Animations activées</span><span className="text-xs text-charcoal-500">Respecte reduced-motion du navigateur</span></span><input type="checkbox" checked={config.motion.enabled} onChange={(event) => update({ ...config, motion: { ...config.motion, enabled: event.target.checked } })} className="h-4 w-4 accent-brand-red" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label-text">Style</span><select className="input-field" value={config.motion.style} onChange={(event) => update({ ...config, motion: { ...config.motion, style: event.target.value as VisualIdentity['motion']['style'] } })}><option value="subtle">Subtil</option><option value="float">Flottement 3D</option><option value="tilt">Inclinaison au survol</option></select></label>
              <label><span className="label-text">Vitesse ({config.motion.speed.toFixed(1)}×)</span><input type="range" min="0.4" max="1.8" step="0.1" value={config.motion.speed} onChange={(event) => update({ ...config, motion: { ...config.motion, speed: Number(event.target.value) } })} className="w-full accent-brand-red" /></label>
              <label><span className="label-text">Intensité ({Math.round(config.motion.intensity * 100)}%)</span><input type="range" min="0" max="1" step="0.05" value={config.motion.intensity} onChange={(event) => update({ ...config, motion: { ...config.motion, intensity: Number(event.target.value) } })} className="w-full accent-brand-red" /></label>
              <label><span className="label-text">Lueur ({Math.round(config.motion.glow * 100)}%)</span><input type="range" min="0" max="1" step="0.05" value={config.motion.glow} onChange={(event) => update({ ...config, motion: { ...config.motion, glow: Number(event.target.value) } })} className="w-full accent-brand-red" /></label>
              <label className="flex items-center gap-2 text-sm text-charcoal-200 sm:col-span-2"><input type="checkbox" checked={config.motion.mobileReduce} onChange={(event) => update({ ...config, motion: { ...config.motion, mobileReduce: event.target.checked } })} className="accent-brand-red" /> Réduire les mouvements sur mobile</label>
            </div>
          </section>

          {versions.length > 0 && <section className="admin-card"><div className="mb-3 flex items-center gap-2"><Clock3 className="h-5 w-5 text-brand-red-light" /><h2 className="text-lg font-semibold text-offwhite">Versions publiées</h2></div><p className="mb-3 text-xs text-charcoal-400">Restaurer une version crée une nouvelle publication, sans effacer l’historique.</p><div className="space-y-2">{versions.map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-charcoal-400/15 p-3"><span className="text-xs text-charcoal-300">Version #{version.id} · {new Date(version.created_at).toLocaleString('fr-FR')}</span><button type="button" className="btn-ghost" disabled={saving} onClick={() => void restoreVersion(version.id)}><RotateCcw className="h-4 w-4" /> Restaurer</button></div>)}</div></section>}
        </div>

        <aside className="space-y-4 2xl:sticky 2xl:top-4">
          <section className="admin-card">
            <div className="mb-3">
              <p className="admin-eyebrow">Aperçu instantané</p>
              <h2 className="text-lg font-semibold text-offwhite">La boutique, en direct</h2>
              <p className="mt-1 text-xs text-charcoal-400">Le vrai storefront, avec le brouillon en cours appliqué.</p>
            </div>
            <LiveStorePreview config={config} />
            <p className="mt-3 text-[11px] leading-5 text-charcoal-500">
              Cet aperçu applique les couleurs, les polices, les médias, les contenus et le mouvement du
              brouillon sans rien publier. Seul « Publier » rend ces changements visibles aux visiteurs.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
