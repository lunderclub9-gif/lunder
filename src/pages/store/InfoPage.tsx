import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/url'
import { toMailtoHref, toTelHref } from '@/lib/contact'

type Setting = { key: string; value: string | null }

const SOCIAL_LABELS: Record<string, string> = {
  instagram_url: 'Instagram',
  facebook_url: 'Facebook',
  tiktok_url: 'TikTok',
}

export default function InfoPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase
      .from('store_settings')
      .select('key, value')
      .eq('is_public', true)
      .then(({ data }) => {
        const next: Record<string, string> = {}
        ;((data as Setting[]) ?? []).forEach((row) => {
          if (row.value) next[row.key] = row.value
        })
        setSettings(next)
      })
  }, [])

  const telHref = toTelHref(settings.phone)
  const mailHref = toMailtoHref(settings.email)
  const socials = Object.keys(SOCIAL_LABELS)
    .map((key) => ({ key, label: SOCIAL_LABELS[key], url: safeExternalUrl(settings[key]) }))
    .filter((social): social is { key: string; label: string; url: string } => Boolean(social.url))

  const policies = [
    { key: 'policy_terms', title: 'Conditions de vente' },
    { key: 'policy_returns', title: 'Retours et échanges' },
    { key: 'policy_privacy', title: 'Confidentialité' },
  ].filter((section) => settings[section.key])

  return (
    <div className="min-h-screen">
      <section className="lz-hero">
        <div className="lz-container py-10 sm:py-12">
          <p className="lz-eyebrow mb-3">LUNDER’S 3D STUDIO</p>
          <h1 className="lz-display text-[clamp(2rem,4vw,3rem)]">Informations & politiques</h1>
          <p className="lz-lead mt-3 max-w-2xl">
            Contacts de l’atelier, fonctionnement des commandes et politiques de la boutique.
          </p>
        </div>
      </section>

      <div className="lz-container py-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="lz-card p-5 sm:p-6">
            <h2 className="text-lg font-bold text-offwhite">Nous contacter</h2>
            <p className="mt-1 text-xs text-charcoal-400">
              Une question sur une pièce, un fichier ou une livraison ? L’atelier vous répond.
            </p>

            <div className="mt-5 space-y-3 text-sm">
              {telHref && (
                <a href={telHref} className="flex items-center gap-3 rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 px-3.5 py-3 transition hover:border-brand-red/40">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red-light"><Phone className="h-4 w-4" /></span>
                  <span>
                    <span className="block text-[10px] uppercase tracking-wider text-charcoal-500">Téléphone</span>
                    <span className="block font-semibold text-offwhite">{settings.phone}</span>
                  </span>
                </a>
              )}
              {mailHref && (
                <a href={mailHref} className="flex items-center gap-3 rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 px-3.5 py-3 transition hover:border-brand-red/40">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red-light"><Mail className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-charcoal-500">E-mail</span>
                    <span className="block break-all font-semibold text-offwhite">{settings.email}</span>
                  </span>
                </a>
              )}
              {settings.address && (
                <div className="flex items-center gap-3 rounded-xl border border-charcoal-400/15 bg-charcoal-900/40 px-3.5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red-light"><MapPin className="h-4 w-4" /></span>
                  <span>
                    <span className="block text-[10px] uppercase tracking-wider text-charcoal-500">Atelier</span>
                    <span className="block font-semibold text-offwhite">{settings.address}</span>
                  </span>
                </div>
              )}
              {!telHref && !mailHref && !settings.address && (
                <p className="rounded-xl border border-dashed border-charcoal-400/20 px-4 py-6 text-center text-xs text-charcoal-500">
                  Les coordonnées du studio seront bientôt disponibles.
                </p>
              )}
            </div>

            {socials.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-charcoal-400/10 pt-4">
                {socials.map((social) => (
                  <a
                    key={social.key}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lz-chip"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {social.label}
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="lz-card p-5 sm:p-6">
            <h2 className="text-lg font-bold text-offwhite">Commander en clair</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-charcoal-300">
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                Paiement en espèces à la réception. Aucune carte bancaire n’est demandée.
              </li>
              <li className="flex gap-2.5">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" />
                Livraison à domicile ou en point relais, selon les options actives dans votre wilaya.
              </li>
              <li className="flex gap-2.5">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" />
                Chaque commande reçoit un numéro et un lien de suivi confidentiel, sans création de compte.
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-charcoal-400/10 pt-4">
              <Link to="/boutique/suivi" className="btn-secondary">Suivre une commande</Link>
              <Link to="/boutique/sur-mesure" className="btn-ghost">Demander un devis</Link>
            </div>
          </section>
        </div>

        {policies.length > 0 && (
          <div className="mt-8 grid gap-4">
            {policies.map((section) => (
              <section key={section.key} className="lz-card p-5 sm:p-6">
                <h2 className="text-lg font-bold text-offwhite">{section.title}</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-charcoal-300">
                  {settings[section.key]}
                </p>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
