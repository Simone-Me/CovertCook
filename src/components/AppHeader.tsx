import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'
import { useMyRounds } from '../features/rounds/hooks'
import { supabase } from '../lib/supabase'

// Pinned in the header on every screen once signed in: a user can be in
// several rounds at once, and mixing them up is the main confusion risk in
// the product (§13) — so the current round's name/colour/emoji and a way
// to jump to another round must always be one glance away, not buried in a
// menu.
export function AppHeader() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const { roundId } = useParams()
  const { data: rounds } = useMyRounds()

  if (!session) {
    return (
      <header className="app-header">
        <strong>{t('app.name')}</strong>
      </header>
    )
  }

  const current = rounds?.find((r) => r.id === roundId)

  return (
    <header className="app-header">
      <a href="/" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
        {t('app.name')}
      </a>
      {rounds && rounds.length > 0 && (
        <select
          aria-label={t('rounds.myRounds')}
          value={roundId ?? ''}
          onChange={(e) => e.target.value && navigate(`/rounds/${e.target.value}`)}
          style={{ marginBottom: 0, flex: 1, borderColor: current?.accent_color }}
        >
          <option value="" disabled>
            {t('rounds.myRounds')}
          </option>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.accent_emoji} {r.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="secondary"
        onClick={() => supabase.auth.signOut()}
        style={{ padding: '8px 10px', fontSize: 13 }}
      >
        {t('auth.signOut')}
      </button>
    </header>
  )
}
