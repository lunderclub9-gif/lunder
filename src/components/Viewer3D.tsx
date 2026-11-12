import { useState, useRef } from 'react'
import { RotateCcw, Maximize, Minimize, Package, Loader2 } from 'lucide-react'
import '@google/model-viewer'

type Props = {
  src: string
  poster?: string
  alt?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string
        poster?: string
        alt?: string
        'auto-rotate'?: boolean
        'camera-controls'?: boolean
        'shadow-intensity'?: string
        'ar-status'?: string
      }, HTMLElement>
    }
  }
}

export default function Viewer3D({ src, poster, alt }: Props) {
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  if (failed) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border border-charcoal-400/15 bg-charcoal-800">
        <div className="text-center">
          <Package className="mx-auto mb-3 h-12 w-12 text-charcoal-600" />
          <p className="text-sm text-charcoal-400">Modèle 3D indisponible</p>
          {poster && (
            <img src={poster} alt={alt ?? ''} className="mt-3 max-h-48 rounded-lg" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden rounded-xl border border-charcoal-400/15 bg-charcoal-800 ${fullscreen ? 'fixed inset-0 z-50 flex items-center justify-center' : ''}`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
        </div>
      )}
      <model-viewer
        src={src}
        poster={poster}
        alt={alt ?? 'Modèle 3D'}
        auto-rotate
        camera-controls
        shadow-intensity="1"
        style={{ width: '100%', height: fullscreen ? '100vh' : '400px' }}
        onLoad={() => setLoading(false)}
        onError={() => { setFailed(true); setLoading(false) }}
      />

      <div className={`absolute bottom-3 right-3 flex gap-2 ${fullscreen ? 'bottom-6 right-6' : ''}`}>
        <button
          onClick={() => {
            const mv = containerRef.current?.querySelector('model-viewer')
            mv?.dispatchEvent(new Event('reset'))
          }}
          className="rounded-lg bg-charcoal-900/80 p-2 text-charcoal-200 backdrop-blur transition-colors hover:text-brand-red"
          aria-label="Réinitialiser la vue"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="rounded-lg bg-charcoal-900/80 p-2 text-charcoal-200 backdrop-blur transition-colors hover:text-brand-red"
          aria-label={fullscreen ? 'Plein écran' : 'Réduire'}
        >
          {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
