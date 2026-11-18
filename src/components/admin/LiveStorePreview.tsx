import { useEffect, useRef, useState } from 'react'
import { Loader2, Monitor, RefreshCw, Smartphone } from 'lucide-react'
import type { VisualIdentity } from '@/lib/visual-identity'

type Props = {
  config: VisualIdentity
}

const DESKTOP_WIDTH = 1280
const DESKTOP_HEIGHT = 820
const MOBILE_WIDTH = 390
const MOBILE_HEIGHT = 780

/**
 * Aperçu réel du storefront : la page `/boutique` est chargée dans une iframe
 * same-origin et reçoit le brouillon courant par `postMessage`. Aucun réglage
 * n'est publié et les visiteurs ne voient rien tant que « Publier » n'est pas
 * utilisé.
 */
export default function LiveStorePreview({ config }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState(0.5)

  const frameWidth = device === 'mobile' ? MOBILE_WIDTH : DESKTOP_WIDTH
  const frameHeight = device === 'mobile' ? MOBILE_HEIGHT : DESKTOP_HEIGHT

  useEffect(() => {
    setReady(false)
  }, [device])

  useEffect(() => {
    if (!ready) return
    const frame = frameRef.current
    frame?.contentWindow?.postMessage(
      { type: 'lunder:visual-identity-preview', config },
      window.location.origin
    )
  }, [config, ready, device])

  useEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    const measure = () => {
      const available = node.clientWidth
      const target = device === 'mobile' ? Math.min(MOBILE_WIDTH, available) : available
      setScale(Math.max(0.2, Math.min(1, target / frameWidth)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [device, frameWidth])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-charcoal-400/20 p-1" role="group" aria-label="Format de l’aperçu">
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            aria-pressed={device === 'desktop'}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${device === 'desktop' ? 'bg-brand-red text-white' : 'text-charcoal-400 hover:text-white'}`}
          >
            <Monitor className="h-3.5 w-3.5" /> Ordinateur
          </button>
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            aria-pressed={device === 'mobile'}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${device === 'mobile' ? 'bg-brand-red text-white' : 'text-charcoal-400 hover:text-white'}`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setReady(false)
            frameRef.current?.contentWindow?.location.reload()
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-charcoal-400/20 px-2.5 py-1.5 text-[11px] font-semibold text-charcoal-300 transition hover:border-brand-red/40 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Recharger
        </button>
      </div>

      <div
        ref={wrapperRef}
        className="relative overflow-hidden rounded-xl border border-charcoal-400/20 bg-charcoal-950"
        style={{ height: Math.round(frameHeight * scale) }}
      >
        <iframe
          ref={frameRef}
          title="Aperçu de la boutique LUNDER"
          src="/boutique?viPreview=1"
          onLoad={() => setReady(true)}
          loading="lazy"
          className="absolute left-0 top-0 origin-top-left border-0 bg-charcoal-950"
          style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}
        />
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-charcoal-950/85 text-xs text-charcoal-400">
            <Loader2 className="h-5 w-5 animate-spin text-brand-red" />
            Chargement de la boutique…
          </div>
        )}
      </div>

      <p className="text-[11px] leading-5 text-charcoal-500">
        {device === 'desktop' ? 'Rendu ordinateur · 1280 px' : 'Rendu mobile · 390 px'} — l’aperçu est
        interactif, vous pouvez y faire défiler la page.
      </p>
    </div>
  )
}
