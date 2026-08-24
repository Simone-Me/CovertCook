import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Turnstile } from '../../components/Turnstile'

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
        <div>
          <label htmlFor="password">{t('auth.passwordLabel')}</label>
          <input
            id="password"
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
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
