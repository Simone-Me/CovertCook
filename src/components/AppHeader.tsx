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
      {/* The name was already a link home, but nothing said so — it read as
          a title. The arrow slides out of the word on hover and the whole
          thing lifts a little, the same gesture as picking an envelope off
          the cloth, so the way back announces itself before it's clicked. */}
      <Link to="/" className="app-logo" aria-label={t('rounds.myRounds')}>
        <span className="app-logo__back" aria-hidden="true">←</span>
        {/* Decorative: the name is right beside it and says the same thing. */}
        <img className="app-logo__mark" src="/logo.webp" alt="" aria-hidden="true" width={26} height={26} />
        <span className="app-logo__name">{t('app.name')}</span>
      </Link>
      {session && (
        <Link to="/profile" className="badge" style={{ textDecoration: 'none' }}>
          {profile?.display_name ?? t('profile.title')}
        </Link>
      )}
    </header>
  )
}
