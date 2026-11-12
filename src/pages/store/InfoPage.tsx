import { useEffect, useState } from 'react'
import { Mail, MapPin, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

  const socials = Object.keys(SOCIAL_LABELS).filter((key) => settings[key])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-offwhite">Informations</h1>

      <section className="admin-card mt-6 space-y-2 text-sm text-charcoal-300">
        <h2 className="mb-2 text-lg font-semibold text-offwhite">Nous contacter</h2>
        {settings.phone ? (
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-brand-red" />
            <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="hover:text-offwhite">
              {settings.phone}
            </a>
          </p>
        ) : null}
        {settings.email ? (
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-brand-red" />
            <a href={`mailto:${settings.email}`} className="hover:text-offwhite">
              {settings.email}
            </a>
          </p>
        ) : null}
        {settings.address ? (
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand-red" />
            {settings.address}
          </p>
        ) : null}
        {!settings.phone && !settings.email && !settings.address && (
          <p className="text-charcoal-400">
            Les coordonnées du studio ne sont pas encore renseignées.
          </p>
        )}

        {socials.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-2">
            {socials.map((key) => (
              <a
                key={key}
                href={settings[key]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-red underline-offset-4 hover:underline"
              >
                {SOCIAL_LABELS[key]}
              </a>
            ))}
          </div>
        )}
      </section>

      {[
        { key: 'policy_terms', title: 'Conditions de vente' },
        { key: 'policy_returns', title: 'Retours et échanges' },
        { key: 'policy_privacy', title: 'Confidentialité' },
      ]
        .filter((section) => settings[section.key])
        .map((section) => (
          <section key={section.key} className="admin-card mt-4">
            <h2 className="mb-2 text-lg font-semibold text-offwhite">{section.title}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-charcoal-300">
              {settings[section.key]}
            </p>
          </section>
        ))}
    </div>
  )
}
