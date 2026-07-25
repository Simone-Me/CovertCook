import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  locale: string
  has_no_restrictions: boolean
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  // true once we know the user is authenticated but has no profiles row yet
  // (auth.users created, complete_signup RPC not yet called) — the app must
  // route these users to the dietary step before anything else.
  needsSignupCompletion: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(uid: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data as Profile | null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    session,
    profile,
    loading,
    needsSignupCompletion: !!session && !profile,
    refreshProfile: async () => {
      if (session) await loadProfile(session.user.id)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
