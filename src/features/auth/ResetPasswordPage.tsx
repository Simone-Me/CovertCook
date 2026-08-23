import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Turnstile } from '../../components/Turnstile'

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    // Supabase's resetPasswordForEmail never reveals whether the address
    // exists (§12.7) — always show the same neutral message regardless of
    // the actual outcome.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_BASE_URL}/reset`,
      captchaToken: captchaToken ?? undefined,
    })
    setSubmitting(false)
    setSent(true)
  }

  return (
    <div className="stack sheet">
      <h1>{t('auth.resetPassword')}</h1>
      {sent ? (
        <p>{t('auth.resetSent')}</p>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <div>
            <label htmlFor="email">{t('auth.email')}</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Turnstile onVerify={setCaptchaToken} />
          <button type="submit" disabled={submitting}>
            {t('auth.resetPassword')}
          </button>
        </form>
      )}
      <p className="muted">
        <Link to="/signin">{t('auth.signIn')}</Link>
      </p>
    </div>
  )
}
