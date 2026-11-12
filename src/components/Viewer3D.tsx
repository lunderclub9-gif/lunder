import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react'
import { RotateCcw, Maximize, Minimize, Package, Loader2 } from 'lucide-react'

type Props = {
  src: string
  poster?: string
  alt?: string
}

type ModelViewerProps = React.HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>
  src?: string
  poster?: string
  alt?: string
  'auto-rotate'?: boolean
  'camera-controls'?: boolean
  'touch-action'?: string
  'shadow-intensity'?: string
  loading?: 'auto' | 'lazy' | 'eager'
  reveal?: 'auto' | 'manual'
}

type ModelViewerElement = HTMLElement & {
  cameraOrbit?: string
  fieldOfView?: string
  resetTurntableRotation?: (radians?: number) => void
  jumpCameraToGoal?: () => void
}

const DEFAULT_CAMERA = '0deg 75deg auto'

// Balise personnalisée déclarée sans namespace JSX global : le cast est purement
// de compilation, React reçoit toujours `model-viewer` à l'exécution.
const ModelViewer = 'model-viewer' as unknown as ComponentType<ModelViewerProps>

export default function Viewer3D({ src, poster, alt }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<ModelViewerElement | null>(null)
  const [inView, setInView] = useState(false)
  const [elementReady, setElementReady] = useState(false)
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [fullscreen, setFullscreen] = useState(false)

  // 1. On ne télécharge ni la librairie ni le modèle avant que la visionneuse
  //    approche du viewport : la fiche produit reste légère sur mobile.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // 2. Chargement paresseux de @google/model-viewer (~1 Mo) dans son propre chunk.
  useEffect(() => {
    if (!inView || elementReady) return
    let cancelled = false
    import('@google/model-viewer')
      .then(() => {
        if (!cancelled) setElementReady(true)
      })
      .catch(() => {
        if (!cancelled) setModelStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [inView, elementReady])

  // 3. React 18 ne branche pas onLoad/onError sur un élément personnalisé :
  //    les écouteurs natifs sont donc attachés à la main.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const handleLoad = () => setModelStatus('ready')
    const handleError = () => setModelStatus('error')
    viewer.addEventListener('load', handleLoad)
    viewer.addEventListener('error', handleError)
    return () => {
      viewer.removeEventListener('load', handleLoad)
      viewer.removeEventListener('error', handleError)
    }
  }, [elementReady])

  // 4. Échap quitte le plein écran.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const resetView = () => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.resetTurntableRotation?.(0)
    viewer.cameraOrbit = DEFAULT_CAMERA
    viewer.fieldOfView = 'auto'
    viewer.jumpCameraToGoal?.()
  }

  if (modelStatus === 'error') {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border border-charcoal-400/15 bg-charcoal-800">
        {poster ? (
          <img
            src={poster}
            alt={alt ?? 'Aperçu du produit'}
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <div className="text-center">
            <Package className="mx-auto mb-3 h-12 w-12 text-charcoal-600" />
            <p className="text-sm text-charcoal-400">Modèle 3D indisponible</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-xl border border-charcoal-400/15 bg-charcoal-800 ${
        fullscreen ? 'fixed inset-0 z-50 flex items-center justify-center' : ''
      }`}
    >
      {(modelStatus === 'loading' || !elementReady) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-charcoal-800">
          <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
          <span className="sr-only">Chargement du modèle 3D</span>
        </div>
      )}

      {inView && (
        <ModelViewer
          ref={(node: HTMLElement | null) => {
            viewerRef.current = node as ModelViewerElement | null
          }}
          src={src}
          poster={poster}
          alt={alt ?? 'Modèle 3D du produit'}
          auto-rotate
          camera-controls
          touch-action="pan-y"
          shadow-intensity="1"
          loading="eager"
          reveal="auto"
          style={{ width: '100%', height: fullscreen ? '100vh' : '400px', background: '#1a1a1d' }}
        />
      )}

      <div className={`absolute right-3 flex gap-2 ${fullscreen ? 'bottom-6 right-6' : 'bottom-3'}`}>
        <button
          type="button"
          onClick={resetView}
          className="rounded-lg bg-charcoal-900/80 p-2 text-charcoal-200 backdrop-blur transition-colors hover:text-brand-red"
          aria-label="Réinitialiser la vue"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setFullscreen((value) => !value)}
          className="rounded-lg bg-charcoal-900/80 p-2 text-charcoal-200 backdrop-blur transition-colors hover:text-brand-red"
          aria-label={fullscreen ? 'Réduire' : 'Plein écran'}
        >
          {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
