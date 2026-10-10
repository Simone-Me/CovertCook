import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PasswordField } from '../../components/PasswordField'
import { checkPassword, LONG_ENOUGH_ALONE, MIN_WITH_CLASSES } from '../../lib/password'

/**
 * Both halves of forgetting a password.
 *
 * Only the first half existed: this page asked for an address and sent a mail,
 * and the link in that mail came back to this same page — which showed the
 * request form again. There was nowhere to actually type a new password, so
 * the flow ended in a loop. The second half is below.
 *
 * Arriving from the mail leaves a short-lived recovery session, which reaches
 * us either as a PASSWORD_RECOVERY event or, if the client parsed the URL
 * before this component mounted, as `type=recovery` still sitting in the hash.
 * Both are checked, because missing it means showing somebody the request form
 * for the third time.
 *
 * That session is NOT a sign-in. Until the new password is saved the rest of
 * the app treats it as nobody (`recovering` in lib/auth.tsx): the header shows
 * no name and every guarded route sends it back here.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { recovering, finishRecovery } = useAuth()
  const [mode, setMode] = useState<'request' | 'set'>(
    recovering || window.location.hash.includes('type=recovery') ? 'set' : 'request',
  )

  // A reset left half-done is picked up where it stopped: reopening the app
  // with the recovery session still on the device lands here, on the form.
  useEffect(() => {
    if (recovering) setMode('set')
  }, [recovering])

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('set')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function onRequest(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    // Supabase's resetPasswordForEmail never reveals whether the address
    // exists (§12.7) — always show the same neutral message regardless of
    // the actual outcome.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_BASE_URL}/reset`,
    })
    setSubmitting(false)
    setSent(true)
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!checkPassword(password).valid) {
      setError(t('auth.password.tooWeak'))
      return
    }
    if (password !== passwordAgain) {
      setError(t('auth.password.mismatch'))
      return
    }

    setSubmitting(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (err) {
      // The most likely one by far: the link sat in an inbox until the
      // recovery session expired. Say that rather than forwarding "Auth
      // session missing".
      setError(err.message)
      return
    }
    // Only now is the session a real sign-in.
    finishRecovery()
    setDone(true)
  }

  const passwordState = !password ? 'idle' : checkPassword(password).valid ? 'free' : 'taken'
  const confirmState = !passwordAgain ? 'idle' : password === passwordAgain ? 'free' : 'taken'

  return (
    <div className="stack sheet">
      <LanguageSwitch />
      <h1>{t(mode === 'set' ? 'auth.password.choose' : 'auth.resetPassword')}</h1>
      {error && <div className="error">{error}</div>}

      {mode === 'set' ? (
        done ? (
          <>
            <p>{t('auth.password.changed')}</p>
            <button type="button" onClick={() => navigate('/', { replace: true })}>
              {t('rounds.myRounds')}
            </button>
          </>
        ) : (
          <form onSubmit={onSetPassword} className="stack">
            <PasswordField
              id="new-password"
              label={t('auth.passwordLabel')}
              value={password}
              onChange={setPassword}
              describedBy="password-rules"
            />
            <p id="password-rules" className={`field-status is-${passwordState}`}>
              {t('auth.password.rules', { classes: MIN_WITH_CLASSES, alone: LONG_ENOUGH_ALONE })}
            </p>

            <PasswordField
              id="new-password-again"
              label={t('auth.password.again')}
              value={passwordAgain}
              onChange={setPasswordAgain}
              allowPaste={false}
              describedBy="password-again-status"
            />
            <p id="password-again-status" className={`field-status is-${confirmState}`}>
              {confirmState === 'taken'
                ? t('auth.password.mismatch')
                : confirmState === 'free'
                  ? t('auth.password.match')
                  : ''}
            </p>

            <button
              type="submit"
              disabled={submitting || passwordState !== 'free' || confirmState !== 'free'}
            >
              {t('auth.password.save')}
            </button>
          </form>
        )
      ) : sent ? (
        <p>{t('auth.resetSent')}</p>
      ) : (
        <form onSubmit={onRequest} className="stack">
          <div>
            <label htmlFor="email">{t('auth.email')}</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting}>
            {t('auth.resetPassword')}
          </button>
        </form>
      )}

      {!done && (
        <p className="muted">
          {/* Walking away from a reset that was not finished drops the
              recovery session, so it cannot be picked up later as a sign-in. */}
          <Link
            to="/signin"
            onClick={() => {
              if (recovering) void supabase.auth.signOut()
            }}
          >
            {t('auth.signIn')}
          </Link>
        </p>
      )}
    </div>
  )
}
