import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  readAdminPreferences,
  playAdminNotificationSound,
  subscribeAdminPreferences,
  type AdminPreferences,
} from '@/lib/admin-preferences'
import {
  notificationDestination,
  type AdminNotification,
  type NotificationEventType,
} from '@/lib/admin-notification-utils'

type AdminNotificationsContextValue = {
  notifications: AdminNotification[]
  unreadCount: number
  loading: boolean
  error: string | null
  realtimeAvailable: boolean | null
  preferences: AdminPreferences
  refresh: () => Promise<void>
  markRead: (notificationId: string) => Promise<boolean>
  markAllRead: () => Promise<boolean>
}

const AdminNotificationsContext = createContext<AdminNotificationsContextValue | null>(null)
const PAGE_SIZE = 30

export function AdminNotificationsProvider({
  ownerId,
  navigate,
  children,
}: {
  ownerId: string | null
  navigate: NavigateFunction
  children: ReactNode
}) {
  const [preferences, setPreferences] = useState(() => readAdminPreferences(ownerId))
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(Boolean(ownerId))
  const [error, setError] = useState<string | null>(null)
  const [realtimeAvailable, setRealtimeAvailable] = useState<boolean | null>(null)
  const knownIds = useRef(new Set<string>())

  useEffect(() => {
    setPreferences(readAdminPreferences(ownerId))
    setNotifications([])
    setUnreadCount(0)
    knownIds.current.clear()
    setLoading(Boolean(ownerId))
  }, [ownerId])

  useEffect(() => {
    if (!ownerId) return
    return subscribeAdminPreferences(ownerId, () => setPreferences(readAdminPreferences(ownerId)))
  }, [ownerId])

  const typeEnabled = useCallback(
    (eventType: NotificationEventType) =>
      eventType === 'new_order' ? preferences.notifyOrders : preferences.notifyCustomRequests,
    [preferences.notifyCustomRequests, preferences.notifyOrders]
  )

  const signalOwner = useCallback(
    (notification: AdminNotification) => {
      if (!typeEnabled(notification.event_type)) return
      if (preferences.soundNotifications) playAdminNotificationSound()
      if (
        preferences.browserNotifications &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        const browserNotification = new window.Notification(notification.title, {
          body: notification.description,
          tag: notification.id,
        })
        browserNotification.onclick = () => {
          window.focus()
          navigate(notificationDestination(notification))
          browserNotification.close()
        }
      }
    },
    [navigate, preferences.browserNotifications, preferences.soundNotifications, typeEnabled]
  )

  const enabledTypes = useMemo(() => {
    const types: NotificationEventType[] = []
    if (preferences.notifyOrders) types.push('new_order')
    if (preferences.notifyCustomRequests) types.push('new_custom_request')
    return types
  }, [preferences.notifyCustomRequests, preferences.notifyOrders])

  const load = useCallback(
    async (signalNew = false) => {
      if (!ownerId) {
        setNotifications([])
        setUnreadCount(0)
        setLoading(false)
        return
      }
      const shouldLoadEvents =
        (preferences.inAppNotifications || preferences.browserNotifications || preferences.soundNotifications) &&
        enabledTypes.length > 0
      const shouldLoadInApp = preferences.inAppNotifications && enabledTypes.length > 0
      const listQuery = shouldLoadEvents
        ? supabase
            .from('owner_notifications')
            .select('id, owner_id, event_type, event_id, related_order_id, related_request_id, title, description, created_at, read_at')
            .eq('owner_id', ownerId)
            .in('event_type', enabledTypes)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)
        : Promise.resolve({ data: [], error: null })
      const countQuery = shouldLoadInApp
        ? supabase
            .from('owner_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('owner_id', ownerId)
            .in('event_type', enabledTypes)
            .is('read_at', null)
        : Promise.resolve({ count: 0, error: null })

      const [listResult, countResult] = await Promise.all([listQuery, countQuery])
      if (listResult.error || countResult.error) {
        setError('Impossible de charger les notifications. Vérifiez la connexion et vos droits.')
        setLoading(false)
        return
      }

      const rows = (listResult.data ?? []) as AdminNotification[]
      if (signalNew) {
        rows.forEach((row) => {
          if (!knownIds.current.has(row.id)) signalOwner(row)
        })
      }
      rows.forEach((row) => knownIds.current.add(row.id))
      setNotifications(shouldLoadInApp ? rows : [])
      setUnreadCount(countResult.count ?? 0)
      setError(null)
      setLoading(false)
    },
    [
      enabledTypes,
      ownerId,
      preferences.browserNotifications,
      preferences.inAppNotifications,
      preferences.soundNotifications,
      signalOwner,
    ]
  )

  useEffect(() => {
    if (!ownerId) return
    let mounted = true
    let fallbackTimer: number | null = null
    let subscribed = false

    const startFallback = () => {
      if (!mounted || fallbackTimer !== null) return
      setRealtimeAvailable(false)
      fallbackTimer = window.setInterval(() => void load(true), 45000)
    }
    const stopFallback = () => {
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer)
      fallbackTimer = null
      setRealtimeAvailable(true)
    }
    const refreshOnFocus = () => void load(subscribed)

    void load(false)
    window.addEventListener('focus', refreshOnFocus)

    const channel = supabase
      .channel(`owner-notifications-${ownerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'owner_notifications',
          filter: `owner_id=eq.${ownerId}`,
        },
        (payload) => {
          const notification = payload.new as AdminNotification
          if (!notification?.id || knownIds.current.has(notification.id)) return
          knownIds.current.add(notification.id)
          signalOwner(notification)
          if (preferences.inAppNotifications && typeEnabled(notification.event_type)) {
            setNotifications((current) =>
              [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, PAGE_SIZE)
            )
            if (!notification.read_at) setUnreadCount((current) => current + 1)
          }
        }
      )
      .subscribe((status) => {
        if (!mounted) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          stopFallback()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          startFallback()
        }
      })

    return () => {
      mounted = false
      window.removeEventListener('focus', refreshOnFocus)
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer)
      void supabase.removeChannel(channel)
    }
  }, [load, ownerId, preferences.inAppNotifications, signalOwner, typeEnabled])

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!ownerId) return false
      const { data, error: updateError } = await supabase
        .from('owner_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('owner_id', ownerId)
        .eq('id', notificationId)
        .is('read_at', null)
        .select('id')
        .maybeSingle()
      if (updateError) {
        setError('Impossible de marquer cette notification comme lue.')
        return false
      }
      if (data) {
        setNotifications((current) =>
          current.map((item) => (item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item))
        )
        setUnreadCount((current) => Math.max(0, current - 1))
      }
      return true
    },
    [ownerId]
  )

  const markAllRead = useCallback(async () => {
    if (!ownerId || enabledTypes.length === 0) return true
    const { error: updateError } = await supabase
      .from('owner_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('owner_id', ownerId)
      .in('event_type', enabledTypes)
      .is('read_at', null)
    if (updateError) {
      setError('Impossible de marquer toutes les notifications comme lues.')
      return false
    }
    setNotifications((current) =>
      current.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() }))
    )
    setUnreadCount(0)
    return true
  }, [enabledTypes, ownerId])

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: preferences.inAppNotifications ? unreadCount : 0,
      loading,
      error,
      realtimeAvailable,
      preferences,
      refresh: () => load(false),
      markRead,
      markAllRead,
    }),
    [error, load, loading, markAllRead, markRead, notifications, preferences, realtimeAvailable, unreadCount]
  )

  return <AdminNotificationsContext.Provider value={value}>{children}</AdminNotificationsContext.Provider>
}

export function useAdminNotifications(): AdminNotificationsContextValue {
  const context = useContext(AdminNotificationsContext)
  if (!context) throw new Error('useAdminNotifications doit être utilisé dans AdminNotificationsProvider.')
  return context
}
