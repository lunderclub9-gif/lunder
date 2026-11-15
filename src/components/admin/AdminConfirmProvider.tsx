import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

export type AdminConfirmOptions = {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}
type ConfirmRequest = Required<AdminConfirmOptions>
type ConfirmAction = (options: AdminConfirmOptions) => Promise<boolean>
const AdminConfirmContext = createContext<ConfirmAction | null>(null)

export function AdminConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const resolver = useRef<((accepted: boolean) => void) | null>(null)
  const confirmAction = useCallback((options: AdminConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false)
    resolver.current = resolve
    setRequest({
      title: options.title,
      description: options.description,
      confirmLabel: options.confirmLabel ?? 'Confirmer',
      cancelLabel: options.cancelLabel ?? 'Annuler',
      tone: options.tone ?? 'default',
    })
  }), [])
  const finish = useCallback((accepted: boolean) => {
    resolver.current?.(accepted)
    resolver.current = null
    setRequest(null)
  }, [])
  useEffect(() => {
    if (!request) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [request, finish])

  return (
    <AdminConfirmContext.Provider value={confirmAction}>
      {children}
      {request && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description" className="w-full max-w-md rounded-2xl border border-charcoal-400/20 bg-charcoal-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <span className={request.tone === 'danger' ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-red/15 text-brand-red-light' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-charcoal-700 text-charcoal-200'}>
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 id="admin-confirm-title" className="text-lg font-semibold text-offwhite">{request.title}</h2>
                <p id="admin-confirm-description" className="mt-2 whitespace-pre-line text-sm leading-relaxed text-charcoal-300">{request.description}</p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => finish(false)} className="btn-secondary">{request.cancelLabel}</button>
              <button type="button" autoFocus onClick={() => finish(true)} className={request.tone === 'danger' ? 'btn-danger' : 'btn-primary'}>{request.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}
    </AdminConfirmContext.Provider>
  )
}

export function useAdminConfirm() {
  const action = useContext(AdminConfirmContext)
  if (!action) throw new Error('useAdminConfirm must be used within AdminConfirmProvider')
  return action
}
