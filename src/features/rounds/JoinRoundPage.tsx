import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { joinRound } from '../../lib/rpc'
import { getTurnstileTicket } from '../../lib/turnstileTicket'
import { Turnstile } from '../../components/Turnstile'

export function JoinRoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const codeFromLink = searchParams.get('code')

  const [code, setCode] = useState(codeFromLink ?? '')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const autoSubmitted = useRef(false)

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!captchaToken) {
      setError(t('errors.generic'))
      return
    }
    setSubmitting(true)
    try {
      const normalizedCode = code.trim().toUpperCase()
      const ticket = await getTurnstileTicket(captchaToken, 'JOIN_ROUND', normalizedCode)
      await joinRound({ code: normalizedCode, turnstileTicket: ticket })

      // the round id isn't returned by join_round (only the member id, to
      // avoid leaking anything before the client re-fetches through RLS) —
      // look it up via the round_members -> rounds relationship the RLS
      // policies already allow this user to read.
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  // Arriving via a shared round link: the code is already known, so join
  // automatically as soon as the captcha resolves instead of making the
  // player retype/resubmit it. Falls back to the manual form on failure.
  useEffect(() => {
    if (codeFromLink && captchaToken && !autoSubmitted.current) {
      autoSubmitted.current = true
      onSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromLink, captchaToken])

  const autoJoining = !!codeFromLink && !error

  return (
    <div className="stack">
      <h1>{t('rounds.join')}</h1>
      {error && <div className="error">{error}</div>}
      {autoJoining ? (
        <p className="muted">{t('rounds.joining')}</p>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <div>
            <label htmlFor="code">{t('rounds.joinCode')}</label>
            <input
              id="code"
              required
              placeholder={t('rounds.joinCodePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <button type="submit" disabled={submitting}>
            {t('actions.submit')}
          </button>
        </form>
      )}
      <Turnstile onVerify={setCaptchaToken} />
    </div>
  )
}
