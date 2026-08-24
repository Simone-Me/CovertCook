import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  locale: string
  has_no_restrictions: boolean
  notifications_enabled: boolean
  deletion_requested_at: string | null
  anonymised_at: string | null
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

  // A stored token can outlive the account it belongs to: the user was
  // deleted, or (constantly, in development) the database was reset while
  // the tab kept its session. The JWT is still signed and unexpired, so
  // nothing notices — until complete_signup tries to insert a profiles row
  // pointing at an auth.users id that is gone and Postgres answers with a
  // raw "violates foreign key constraint profiles_id_fkey", which tells a
  // person nothing they can act on.
  //
  // Ask the server who this token belongs to; if it no longer knows, the
  // session is a ghost and the honest thing is to clear it and let them
  // sign in again.
  async function discardGhostSession(): Promise<boolean> {
    const { error } = await supabase.auth.getUser()
    if (!error) return false
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    return true
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && (await discardGhostSession())) {
        setLoading(false)
        return
      }
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
