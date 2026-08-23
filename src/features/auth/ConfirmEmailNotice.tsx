import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

const COOLDOWN_SECONDS = 120

/**
 * The screen between signing up and being able to do anything.
 *
 * It used to be one borrowed sentence, which is the worst possible moment to
 * be vague: the person is holding a half-made account and waiting for a mail
 * that, for a new sending domain, very often lands in spam. So this says that
 * out loud rather than letting them conclude the app is broken.
 *
 * The resend has a two-minute floor. Not to protect the mail provider — to
 * protect the person: hammering resend is what actually gets a sender marked
 * as spam, and every extra copy makes the inbox harder to search, not easier.
 * The countdown starts filled in, because the first mail has just gone out.
 */
export function ConfirmEmailNotice({ email }: { email: string }) {
  const { t } = useTranslation()
  const [left, setLeft] = useState(COOLDOWN_SECONDS)
  const [sending, setSending] = useState(false)
  const [sentAgain, setSentAgain] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (left <= 0) return
    const id = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [left])

  async function onResend() {
    setError(null)
    setSending(true)
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      // Same reason as sign-up: without this the link comes back pointing at
      // whatever the project's Site URL happens to be.
      options: { emailRedirectTo: `${import.meta.env.VITE_APP_BASE_URL}/` },
    })
    setSending(false)
    if (err) {
      setError(err.message)
      return
    }
    setSentAgain(true)
    setLeft(COOLDOWN_SECONDS)
  }

  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, '0')

  return (
    <div className="stack sheet">
      <h1>{t('auth.confirm.title')}</h1>

      <p>{t('auth.confirm.sentTo', { email })}</p>

      <div className="howto">
        <p className="howto__lead">{t('auth.confirm.nothingLead')}</p>
        <ol className="howto__steps">
          {(t('auth.confirm.steps', { returnObjects: true }) as string[]).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {/* The single most useful sentence on this screen. */}
        <p className="howto__note is-warn">{t('auth.confirm.spam')}</p>
      </div>

      {error && <div className="error">{error}</div>}
      {sentAgain && !error && <p className="muted">{t('auth.confirm.sentAgain')}</p>}

      <div className="row">
        <button type="button" disabled={sending || left > 0} onClick={onResend}>
          {t('auth.confirm.resend')}
        </button>
        {left > 0 && (
          <span className="muted countdown">
            {t('auth.confirm.wait')}{' '}
            <span className="countdown__clock">
              {mm}:{ss}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
