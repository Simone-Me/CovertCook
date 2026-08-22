import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth'

// The round switcher that used to live here is gone. It solved a problem
// this product doesn't have: people run one dinner at a time, and every
// round they're in is already listed on the home screen — so a dropdown
// duplicating that list earned its place in the one row visible on every
// single screen without giving anything back.
//
// What belongs in that row instead is the way back to yourself: the
// account, the language, and the allergy list every brief in every round
// gets validated against.
export function AppHeader() {
  const { t } = useTranslation()
  const { session, profile } = useAuth()

  return (
    <header className="app-header">
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600, flex: 1 }}>
        {t('app.name')}
      </Link>
      {session && (
        <Link to="/profile" className="badge" style={{ textDecoration: 'none' }}>
          {profile?.display_name ?? t('profile.title')}
        </Link>
      )}
    </header>
  )
}
