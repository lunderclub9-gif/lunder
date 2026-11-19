import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useVisualIdentity } from '@/lib/visual-identity'

type Props = {
  children: ReactNode
  /** Décalage en millisecondes pour créer une cascade légère. */
  delay?: number
  className?: string
}

/**
 * Révélation douce au défilement. Respecte le réglage « animations » du
 * Visual Identity Studio, prefers-reduced-motion et l'absence
 * d'IntersectionObserver (le contenu s'affiche alors immédiatement).
 */
export default function Reveal({ children, delay = 0, className = '' }: Props) {
  const { motion } = useVisualIdentity()
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!motion.enabled)

  useEffect(() => {
    if (!motion.enabled) {
      setVisible(true)
      return
    }
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [motion.enabled])

  return (
    <div
      ref={ref}
      className={`lz-reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{ '--lz-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}
