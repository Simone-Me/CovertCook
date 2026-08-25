import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Turnstile } from '../../components/Turnstile'
import { PasswordField } from '../../components/PasswordField'

export function SignInPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    setSubmitting(false)
    if (error) setError(error.message)
  }

  return (
    <div className="stack sheet">
      <LanguageSwitch />
      <h1>{t('auth.signIn')}</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div>
          <label htmlFor="email">{t('auth.email')}</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {/* The same field as the two places a password is chosen, so the eye
            is where it is expected. Two differences, both deliberate:
            `current-password` tells a manager to offer the saved one rather
            than generate a new one, and there is no minimum length — a
            sign-in form must never hold somebody's own password against a
            rule written after they chose it. The old minLength={10} did
            exactly that: an account made under the previous rule could not
            even submit the form. */}
        <PasswordField
          id="password"
          label={t('auth.passwordLabel')}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <Turnstile onVerify={setCaptchaToken} />
        <button type="submit" disabled={submitting}>
          {t('auth.signIn')}
        </button>
      </form>
      <p className="muted">
        <Link to="/reset">{t('auth.forgotPassword')}</Link>
      </p>
      <p className="muted">
        {t('auth.noAccount')} <Link to="/signup">{t('auth.signUp')}</Link>
      </p>
    </div>
  )
}
