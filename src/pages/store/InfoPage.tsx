import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MapPin, MessageCircle, Phone, ShieldCheck, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/url'
import { toMailtoHref, toTelHref, toWhatsAppHref } from '@/lib/contact'

type Setting = { key: string; value: string | null }

const SOCIAL_LABELS: Record<string, string> = {
  instagram_url: 'Instagram',
  facebook_url: 'Facebook',
  tiktok_url: 'TikTok',
}

const FAQ = [
  {
    title: 'Faut-il créer un compte pour acheter ?',
    body: 'Non. La boutique fonctionne sans compte client. Pour retrouver une commande, utilisez sa référence et le numéro de téléphone associé.',
  },
  {
    title: 'Comment fonctionne une demande sur mesure ?',
    body: 'Décrivez votre besoin et joignez une photo ou un fichier si vous le souhaitez. Les dimensions et la matière peuvent rester inconnues : le studio étudiera le projet et vous préparera un devis.',
  },
  {
    title: 'Quand ma commande est-elle confirmée ?',
    body: 'Après l’envoi, le studio vérifie les informations et confirme la commande. Vous pouvez consulter son état depuis la page de suivi.',
  },
  {
    title: 'Comment sont calculés les frais de livraison ?',
    body: 'Ils dépendent de la wilaya, de la commune et du mode de livraison disponible. Le montant est affiché avant la validation finale.',
  },
  {
    title: 'Comment contacter le studio ?',
    body: 'Utilisez les coordonnées et les réseaux sociaux affichés sur cette page lorsqu’ils sont renseignés.',
  },
]

export default function InfoPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    supabase
      .from('store_settings')
      .select('key, value')
      .eq('is_public', true)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error('[LUNDER] informations publiques indisponibles')
          setSettings({})
        } else {
          const next: Record<string, string> = {}
          ;((data as Setting[]) ?? []).forEach((row) => {
            if (row.value) next[row.key] = row.value
          })
          setSettings(next)
        }
        setLoaded(true)
      })
    return () => { active = false }
  }, [])

  const telHref = toTelHref(settings.phone)
  const whatsappHref = toWhatsAppHref(settings.whatsapp || settings.phone)
  const mailHref = toMailtoHref(settings.email)
  const socials = Object.keys(SOCIAL_LABELS)
    .map((key) => ({ key, label: SOCIAL_LABELS[key], url: safeExternalUrl(settings[key]) }))
    .filter((item): item is { key: string; label: string; url: string } => Boolean(item.url))

  const policies = [
    { key: 'policy_terms', title: 'Conditions de vente' },
    { key: 'policy_returns', title: 'Retours et échanges' },
    { key: 'policy_privacy', title: 'Confidentialité' },
  ].filter((item) => settings[item.key])

  return (
    <div className="min-h-screen">
      <section className="border-b border-charcoal-400/10 bg-charcoal-950">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="admin-eyebrow">LUNDER’S 3D STUDIO</p>
          <h1 className="text-3xl font-bold text-offwhite sm:text-4xl">Informations & assistance</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal-300">
            Retrouvez les réponses aux questions courantes, les moyens de contacter le studio et les politiques de la boutique.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/boutique/produits" className="btn-primary">Voir la boutique</Link>
            <Link to="/boutique/suivi" className="btn-secondary">Suivre une commande</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:px-8">
        <div className="space-y-6">
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><ShieldCheck className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-semibold text-offwhite">Questions fréquentes</h2>
                <p className="text-xs text-charcoal-400">Les informations essentielles avant votre commande.</p>
              </div>
            </div>
            <div className="space-y-3">
              {FAQ.map((item) => (
                <details key={item.title} className="group rounded-xl border border-charcoal-400/15 bg-charcoal-800/60 p-4 open:border-brand-red/30">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-offwhite">
                    {item.title}<span className="text-brand-red-light transition group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-charcoal-400">{item.body}</p>
                </details>
              ))}
            </div>
          </section>

          {policies.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-offwhite">Politiques de la boutique</h2>
              <div className="space-y-3">
                {policies.map((policy) => (
                  <article key={policy.key} className="rounded-xl border border-charcoal-400/15 bg-charcoal-800/60 p-5">
                    <h3 className="mb-2 font-semibold text-offwhite">{policy.title}</h3>
                    <p className="whitespace-pre-line text-sm leading-6 text-charcoal-300">{settings[policy.key]}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/70 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red-light"><MessageCircle className="h-5 w-5" /></div>
              <div>
                <h2 className="font-semibold text-offwhite">Contacter le studio</h2>
                <p className="text-xs text-charcoal-400">Nous sommes à votre écoute.</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {telHref && (
                <a href={telHref} className="flex items-center gap-3 rounded-lg border border-charcoal-400/10 p-3 text-charcoal-200 transition hover:border-brand-red/30 hover:text-offwhite">
                  <Phone className="h-4 w-4 text-brand-red-light" /> {settings.phone}
                </a>
              )}
              {whatsappHref && (
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-charcoal-400/10 p-3 text-charcoal-200 transition hover:border-brand-red/30 hover:text-offwhite">
                  <MessageCircle className="h-4 w-4 text-brand-red-light" /> WhatsApp
                </a>
              )}
              {mailHref && (
                <a href={mailHref} className="flex items-center gap-3 rounded-lg border border-charcoal-400/10 p-3 text-charcoal-200 transition hover:border-brand-red/30 hover:text-offwhite">
                  <Mail className="h-4 w-4 text-brand-red-light" /> {settings.email}
                </a>
              )}
              {settings.address && (
                <p className="flex items-start gap-3 rounded-lg border border-charcoal-400/10 p-3 text-charcoal-300">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light" /> {settings.address}
                </p>
              )}
              {loaded && !telHref && !whatsappHref && !mailHref && !settings.address && socials.length === 0 && (
                <p className="text-sm text-charcoal-400">Les coordonnées du studio seront bientôt disponibles.</p>
              )}
            </div>
            {socials.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-charcoal-400/10 pt-4">
                {socials.map((social) => (
                  <a key={social.key} href={social.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-charcoal-400/20 px-3 py-2 text-xs text-charcoal-300 transition hover:border-brand-red/40 hover:text-offwhite">
                    {social.label}
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-charcoal-400/15 bg-charcoal-800/50 p-5">
            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5 text-brand-red-light" />
              <h2 className="font-semibold text-offwhite">Livraison & suivi</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-charcoal-400">
              Les tarifs et modes de livraison disponibles sont calculés selon votre destination et présentés avant de confirmer votre commande.
            </p>
            <Link to="/boutique/suivi" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-red-light hover:text-offwhite">
              Accéder au suivi <span aria-hidden="true">→</span>
            </Link>
          </section>
        </aside>
      </div>
    </div>
  )
}
