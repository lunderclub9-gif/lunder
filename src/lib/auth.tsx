import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import posthog, { isPostHogEnabled } from './posthog'
import { supabase, type Profile } from './supabase'

type AuthContextType = {
  session: Session | null
  profile: Profile | null
  isOwner: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  isOwner: false,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const identifiedUserId = useRef<string | null>(null)

  useEffect(() => {
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

    const loadProfile = async (currentSession: Session) => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .maybeSingle()
      const currentProfile = data as Profile | null

      setProfile(currentProfile)
      identifyUser(currentSession, currentProfile)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        void loadProfile(session)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session) {
        void loadProfile(session)
      } else {
        setProfile(null)
        if (event === 'SIGNED_OUT' && isPostHogEnabled) {
          posthog.reset()
          identifiedUserId.current = null
        }
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        isOwner: profile?.role === 'owner',
        loading,
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
