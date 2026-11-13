import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import posthog, { isPostHogEnabled } from './posthog'
import { supabase, type Profile } from './supabase'

type AuthContextType = {
  session: Session | null
  profile: Profile | null
  isOwner: boolean
  loading: boolean
  profileUnavailable: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  isOwner: false,
  loading: true,
  profileUnavailable: false,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileUnavailable, setProfileUnavailable] = useState(false)
  const identifiedUserId = useRef<string | null>(null)
  // Identifie la requête de profil la plus récente : une réponse lente arrivée
  // après une déconnexion ne doit pas réécrire l'état.
  const requestId = useRef(0)

  useEffect(() => {
    let cancelled = false

    const identifyUser = (currentSession: Session, currentProfile: Profile | null) => {
      if (!isPostHogEnabled || identifiedUserId.current === currentSession.user.id) return

      if (identifiedUserId.current) {
        posthog.reset()
      }

      posthog.identify(currentSession.user.id, {
        ...(currentSession.user.email ? { email: currentSession.user.email } : {}),
        ...(currentProfile?.full_name ? { name: currentProfile.full_name } : {}),
        ...(currentProfile ? { role: currentProfile.role } : {}),
      })
      identifiedUserId.current = currentSession.user.id
    }

    /**
     * Charge le profil du compte connecté. En cas d'échec réseau ou de refus
     * RLS, on ne bloque jamais l'interface : l'utilisateur reste connecté mais
     * sans rôle, donc sans accès propriétaire, et l'erreur est signalée.
     */
    const loadProfile = async (currentSession: Session) => {
      const current = ++requestId.current

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .maybeSingle()

      if (cancelled || current !== requestId.current) return

      if (error) {
        console.error('[LUNDER] profil indisponible', error.code ?? 'erreur inconnue')
        setProfile(null)
        setProfileUnavailable(true)
        setLoading(false)
        return
      }

      const currentProfile = data as Profile | null
      setProfile(currentProfile)
      setProfileUnavailable(!currentProfile)
      identifyUser(currentSession, currentProfile)
      setLoading(false)
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Session illisible ou expirée : on repart d'un état visiteur.
          console.error('[LUNDER] session indisponible', error.name ?? 'erreur inconnue')
          setSession(null)
          setProfile(null)
          setLoading(false)
          return
        }

        setSession(data.session)
        if (data.session) {
          void loadProfile(data.session)
        } else {
          setLoading(false)
        }
      })
      .catch(() => {
        if (cancelled) return
        setSession(null)
        setProfile(null)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return
      setSession(nextSession)
      if (nextSession) {
        void loadProfile(nextSession)
      } else {
        requestId.current += 1
        setProfile(null)
        setProfileUnavailable(false)
        if (event === 'SIGNED_OUT' && isPostHogEnabled) {
          posthog.reset()
          identifiedUserId.current = null
        }
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    requestId.current += 1
    await supabase.auth.signOut()
    setProfile(null)
    setProfileUnavailable(false)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        isOwner: profile?.role === 'owner',
        loading,
        profileUnavailable,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
