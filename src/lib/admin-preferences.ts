export type PrintFormat = 'a4' | 'thermal'
export type ThermalWidth = 58 | 80

export type AdminPreferences = {
  inAppNotifications: boolean
  browserNotifications: boolean
  browserPermissionPrompted: boolean
  soundNotifications: boolean
  notifyOrders: boolean
  notifyCustomRequests: boolean
  defaultPrintFormat: PrintFormat
  thermalWidth: ThermalWidth
}

export const DEFAULT_ADMIN_PREFERENCES: AdminPreferences = {
  inAppNotifications: true,
  browserNotifications: false,
  browserPermissionPrompted: false,
  soundNotifications: false,
  notifyOrders: true,
  notifyCustomRequests: true,
  defaultPrintFormat: 'a4',
  thermalWidth: 80,
}

const PREFERENCE_EVENT = 'lunder-admin-preferences-changed'
const storageKey = (ownerId: string) => `lunder-admin-preferences:${ownerId}`

export function normalizeAdminPreferences(value: unknown): AdminPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_ADMIN_PREFERENCES }
  const input = value as Partial<AdminPreferences>
  return {
    inAppNotifications: typeof input.inAppNotifications === 'boolean' ? input.inAppNotifications : true,
    browserNotifications: typeof input.browserNotifications === 'boolean' ? input.browserNotifications : false,
    browserPermissionPrompted: typeof input.browserPermissionPrompted === 'boolean' ? input.browserPermissionPrompted : false,
    soundNotifications: typeof input.soundNotifications === 'boolean' ? input.soundNotifications : false,
    notifyOrders: typeof input.notifyOrders === 'boolean' ? input.notifyOrders : true,
    notifyCustomRequests: typeof input.notifyCustomRequests === 'boolean' ? input.notifyCustomRequests : true,
    defaultPrintFormat: input.defaultPrintFormat === 'thermal' ? 'thermal' : 'a4',
    thermalWidth: input.thermalWidth === 58 ? 58 : 80,
  }
}

export function readAdminPreferences(ownerId: string | null): AdminPreferences {
  if (!ownerId || typeof window === 'undefined') return { ...DEFAULT_ADMIN_PREFERENCES }
  try {
    const stored = window.localStorage.getItem(storageKey(ownerId))
    return stored ? normalizeAdminPreferences(JSON.parse(stored)) : { ...DEFAULT_ADMIN_PREFERENCES }
  } catch {
    return { ...DEFAULT_ADMIN_PREFERENCES }
  }
}

export function writeAdminPreferences(ownerId: string, preferences: AdminPreferences): void {
  const normalized = normalizeAdminPreferences(preferences)
  try {
    window.localStorage.setItem(storageKey(ownerId), JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT, { detail: { ownerId } }))
  } catch {
    // Les préférences restent utilisables dans l’écran courant si le stockage local est bloqué.
  }
}

export function subscribeAdminPreferences(ownerId: string, listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onCustomEvent = (event: Event) => {
    if ((event as CustomEvent<{ ownerId?: string }>).detail?.ownerId === ownerId) listener()
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey(ownerId)) listener()
  }
  window.addEventListener(PREFERENCE_EVENT, onCustomEvent)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, onCustomEvent)
    window.removeEventListener('storage', onStorage)
  }
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUseBrowserNotifications()) return 'unsupported'
  return window.Notification.requestPermission()
}

export function playAdminNotificationSound(): boolean {
  if (typeof window === 'undefined' || !window.AudioContext) return false
  try {
    const context = new window.AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 740
    gain.gain.setValueAtTime(0.12, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.18)
    oscillator.addEventListener('ended', () => void context.close(), { once: true })
    return true
  } catch {
    return false
  }
}
