import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearRecoveryPending, markRecoveryPending, recoveryPending } from './recovery'

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
  // true while the session came from a reset link and no new password has
  // been saved yet — it may only be used on /reset (see recovery.ts).
  recovering: boolean
  // Called once the new password is saved, or when a real sign-in replaces
  // the recovery session.
  finishRecovery: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(recoveryPending)

  async function loadProfile() {
    // A select on profiles gives only the public columns, even for yourself
    // (0109); the whole row of your own comes from the function.
    // Falls back to the old select while a database without 0109 is still
    // answering, so the client can ship before the migration does.
    const res = await supabase.rpc('my_profile').maybeSingle()
    if (!res.error) {
      setProfile(res.data as Profile | null)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
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
      // A reset link that never produced a session (expired, already used)
      // leaves nothing to restrict; don't let its flag catch the next
      // account created on this device.
      if (!data.session) {
        clearRecoveryPending()
        setRecovering(false)
      }
      if (!data.session) {
        setSession(null)
        setLoading(false)
        return
      }
      // Both at once: the ghost check is a round trip to Auth and the profile
      // has no reason to queue behind it. A ghost's profile is simply dropped.
      const [ghost] = await Promise.all([discardGhostSession(), loadProfile()])
      if (ghost) {
        setProfile(null)
        setLoading(false)
        return
      }
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        markRecoveryPending()
        setRecovering(true)
      } else if (event === 'SIGNED_OUT') {
        clearRecoveryPending()
        setRecovering(false)
      }
      setSession(newSession)
      // The first session is getSession's to load, above, and a refreshed
      // token is the same person: asking for the profile again on either was
      // the second identical request on every start.
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
      if (newSession) {
        await loadProfile()
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
    recovering: !!session && recovering,
    finishRecovery: () => {
      clearRecoveryPending()
      setRecovering(false)
    },
    refreshProfile: async () => {
      if (session) await loadProfile()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
