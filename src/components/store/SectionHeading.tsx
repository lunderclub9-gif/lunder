import type { ReactNode } from 'react'

type Props = {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  align?: 'start' | 'center'
  className?: string
}

/** En-tête de section homogène pour tout le storefront. */
export default function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'start',
  className = '',
}: Props) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${
        align === 'center' ? 'sm:flex-col sm:items-center sm:text-center' : ''
      } ${className}`.trim()}
    >
      <div className={`max-w-2xl ${align === 'center' ? 'mx-auto' : ''}`}>
        {eyebrow && <p className="lz-eyebrow mb-3">{eyebrow}</p>}
        <h2 className="lz-h2">{title}</h2>
        {description && <p className="lz-lead mt-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
