import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Clock3, FileText, Loader2, Package, Settings2, X } from 'lucide-react'
import { useAdminNotifications } from './AdminNotificationsProvider'
import { notificationDestination } from '@/lib/admin-notification-utils'

const dateLabel = (value: string) =>
  new Date(value).toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' })

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const {
    notifications,
    unreadCount,
    loading,
    error,
    realtimeAvailable,
    preferences,
    markRead,
    markAllRead,
  } = useAdminNotifications()

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const openNotification = async (notification: (typeof notifications)[number]) => {
    if (!notification.read_at) await markRead(notification.id)
    setOpen(false)
    navigate(notificationDestination(notification))
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} non lue(s)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-charcoal-200 transition-colors hover:bg-charcoal-700 hover:text-offwhite"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand-red px-1 text-center text-[10px] font-bold leading-5 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="Centre de notifications"
          className="absolute right-0 top-12 z-50 flex max-h-[min(75vh,38rem)] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-charcoal-400/20 bg-charcoal-900 shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-charcoal-400/15 px-4 py-3">
            <div>
              <h2 className="font-semibold text-offwhite">Notifications</h2>
              <p className="text-xs text-charcoal-400">{unreadCount} non lue(s)</p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="btn-ghost px-2 py-2 text-xs"
                  title="Tout marquer comme lu"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Tout lire</span>
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost p-2" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {realtimeAvailable === false && (
            <p className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
              Temps réel indisponible : actualisation automatique toutes les 45 secondes.
            </p>
          )}
          {!preferences.inAppNotifications && (
            <p className="border-b border-charcoal-400/15 px-4 py-3 text-xs text-charcoal-300">
              Les notifications internes sont désactivées dans les paramètres.
            </p>
          )}
          {error && <p role="alert" className="px-4 py-3 text-xs text-brand-red-light">{error}</p>}

          <div className="overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-charcoal-400">
                {preferences.inAppNotifications ? 'Aucune notification récente.' : 'Activez les notifications internes pour afficher les événements ici.'}
              </p>
            ) : (
              <ul>
                {notifications.map((notification) => {
                  const Icon = notification.event_type === 'new_order' ? Package : FileText
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => void openNotification(notification)}
                        className={`flex w-full gap-3 border-b border-charcoal-400/10 px-4 py-3 text-left transition-colors hover:bg-charcoal-800 ${notification.read_at ? '' : 'bg-brand-red/5'}`}
                      >
                        <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${notification.read_at ? 'bg-charcoal-700 text-charcoal-300' : 'bg-brand-red/15 text-brand-red-light'}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-offwhite">{notification.title}</span>
                            {!notification.read_at && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-brand-red" aria-label="Non lue" />}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-charcoal-300">{notification.description}</span>
                          <span className="mt-2 flex items-center gap-1 text-[11px] text-charcoal-500">
                            <Clock3 className="h-3 w-3" />
                            {dateLabel(notification.created_at)}
                            <span>· {notification.event_type === 'new_order' ? 'Commande' : 'Demande sur mesure'}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-charcoal-400/15 px-4 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate('/admin/parametres')
              }}
              className="btn-ghost w-full justify-start px-2 text-xs"
            >
              <Settings2 className="h-4 w-4" />
              Préférences des notifications
            </button>
          </footer>
        </section>
      )}
    </div>
  )
}
