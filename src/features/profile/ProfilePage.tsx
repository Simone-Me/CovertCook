import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../lib/i18n'
import type { DietaryKind } from '../../lib/rpc'

const KINDS: DietaryKind[] = ['ALLERGY_SEVERE', 'ALLERGY_MILD', 'DIET', 'DISLIKE']

interface DietaryRow {
  id: string
  kind: DietaryKind
  label: string
  note: string | null
}

// Everything about you rather than about a dinner. Until now this had no
// home at all: the address you signed up with was invisible, and dietary
// restrictions could only be set once, during sign-up, with no way back —
// which is the wrong shape for the one thing in this app that has to be
// right, since every brief in every round is validated against it.
export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const { profile, session, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  const [kind, setKind] = useState<DietaryKind>('ALLERGY_SEVERE')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: entries } = useQuery({
    queryKey: ['dietary', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dietary_entries')
        .select('id,kind,label,note')
        .order('kind', { ascending: true })
      if (error) throw error
      return data as DietaryRow[]
    },
  })

  async function onAdd() {
    if (!label.trim() || !profile?.id) return
    setError(null)
    setBusy(true)
    try {
      const { error } = await supabase
        .from('dietary_entries')
        .insert({ profile_id: profile.id, kind, label: label.trim() })
      if (error) throw error
      setLabel('')
      await queryClient.invalidateQueries({ queryKey: ['dietary'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(id: string) {
    setError(null)
    try {
      const { error } = await supabase.from('dietary_entries').delete().eq('id', id)
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['dietary'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  // The select is controlled by profile.locale, and that value lives in
  // AuthProvider's state — not in react-query. Invalidating a 'profile'
  // query key did nothing, so the stored value never caught up: the UI
  // switched language but the dropdown kept showing the old one, and
  // choosing the language it was already displaying fires no change event
  // at all. Switching back needed a page reload.
  //
  // refreshProfile re-reads the row into that state, which is what the
  // dropdown actually reads from.
  async function onLocale(locale: SupportedLocale) {
    if (!profile?.id) return
    setError(null)
    try {
      const { error } = await supabase.from('profiles').update({ locale }).eq('id', profile.id)
      if (error) throw error
      await i18n.changeLanguage(locale)
      await refreshProfile()
    } catch (err) {
      // Don't leave the interface speaking a language the account doesn't
      // claim — the chat templates and secret names are chosen server-side
      // from the stored column, so the two drifting apart is worse than
      // not switching.
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('profile.title')}</h1>
      {error && <div className="error">{error}</div>}

      <div className="card stack">
        <div>
          <label>{t('auth.displayName')}</label>
          <strong>{profile?.display_name}</strong>
        </div>
        <div>
          <label>{t('profile.signedInAs')}</label>
          <strong>{session?.user.email}</strong>
        </div>
        <div>
          <label htmlFor="locale">{t('app.language')}</label>
          <select
            id="locale"
            value={profile?.locale ?? i18n.resolvedLanguage ?? 'en'}
            onChange={(e) => onLocale(e.target.value as SupportedLocale)}
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {t(`profile.locale.${l}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h2>{t('dietary.title')}</h2>
      {/* Round-wide, not per-dinner: a brief is checked against every
          diner's restrictions, so this list follows you into every round
          you join. Changing it here changes it everywhere. */}
      <p className="muted">{t('profile.dietaryHelp')}</p>

      <div className="stack">
        {entries?.length === 0 && <p className="muted">{t('profile.noRestrictions')}</p>}
        {entries?.map((e) => (
          <div key={e.id} className="card row" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>{e.label}</strong>
              <span className="muted"> — {t(`dietary.kind.${e.kind}`)}</span>
            </span>
            <button type="button" className="secondary" onClick={() => onRemove(e.id)}>
              {t('actions.remove')}
            </button>
          </div>
        ))}
      </div>

      <div className="card stack">
        <label htmlFor="new-kind">{t('dietary.addEntry')}</label>
        <select id="new-kind" value={kind} onChange={(e) => setKind(e.target.value as DietaryKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`dietary.kind.${k}`)}
            </option>
          ))}
        </select>
        <div className="row">
          <input
            placeholder={t('dietary.label')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
          <button type="button" disabled={busy || !label.trim()} onClick={onAdd}>
            {t('actions.add')}
          </button>
        </div>
      </div>

      <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>
        {t('auth.signOut')}
      </button>
    </div>
  )
}
