import { describe, expect, it } from 'vitest'
import { DEFAULT_ADMIN_PREFERENCES, normalizeAdminPreferences } from './admin-preferences'

describe('admin preferences', () => {
  it('uses safe defaults with system notifications and sound disabled', () => {
    expect(DEFAULT_ADMIN_PREFERENCES.browserNotifications).toBe(false)
    expect(DEFAULT_ADMIN_PREFERENCES.soundNotifications).toBe(false)
    expect(DEFAULT_ADMIN_PREFERENCES.inAppNotifications).toBe(true)
    expect(DEFAULT_ADMIN_PREFERENCES.defaultPrintFormat).toBe('a4')
    expect(DEFAULT_ADMIN_PREFERENCES.thermalWidth).toBe(80)
  })

  it('normalizes malformed or partial local values without enabling opt-in alerts', () => {
    expect(normalizeAdminPreferences({ browserNotifications: 'yes', thermalWidth: 999, defaultPrintFormat: 'letter' })).toEqual(
      DEFAULT_ADMIN_PREFERENCES
    )
  })

  it('preserves valid explicit local choices', () => {
    expect(normalizeAdminPreferences({ soundNotifications: true, defaultPrintFormat: 'thermal', thermalWidth: 58 })).toMatchObject({
      soundNotifications: true,
      defaultPrintFormat: 'thermal',
      thermalWidth: 58,
    })
  })
})
