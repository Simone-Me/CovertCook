import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

/**
 * "Continue with Google", the same button on sign-in and sign-up.
 *
 * One button for both on purpose: Google does not distinguish them. A person
 * who has never been here comes back with a brand-new account and no profile,
 * which the router already sends to the rest of signing up (consents, food,
 * name) — exactly where somebody who confirmed their email lands.
 *
 * Same address as an existing email account → Supabase links the two into one
 * account (Google has verified the address). Nobody ends up with two profiles
 * and two sets of allergies for the same inbox.
 */
export function GoogleButton() {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Must be in Supabase's redirect allow-list, like every other link the
      // app asks Auth to come back to.
      options: { redirectTo: `${import.meta.env.VITE_APP_BASE_URL}/` },
    })
    // On success the page is already leaving for Google; only a failure
    // (provider switched off, network) returns here.
    if (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <button type="button" className="secondary google-button" onClick={onClick} disabled={busy}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
          <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
        <span>{t('auth.withGoogle')}</span>
      </button>
      <p className="auth-or muted">{t('auth.or')}</p>
    </>
  )
}
