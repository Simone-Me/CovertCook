import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { joinRound, notifyHostOfArrival } from '../../lib/rpc'
import { getTurnstileTicket } from '../../lib/turnstileTicket'
import { Turnstile } from '../../components/Turnstile'
import { BackToTable } from '../../components/BackToTable'
import { takeJoinCode } from '../../lib/pendingJoin'

export function JoinRoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Either the link carried it, or it survived a sign-up round-trip in
  // sessionStorage (see src/lib/pendingJoin.ts). Read once, on mount, so a
  // re-render can't resurrect a code the person has already dismissed.
  //
  // takeJoinCode() runs FIRST and unconditionally, because it is what
  // clears the stash. Written as `searchParams.get('code') ?? takeJoinCode()`
  // it short-circuits whenever the URL carries a code — leaving the stash
  // behind forever, so MyRoundsPage's "you were on your way somewhere"
  // redirect fired every single time and bounced between / and /join. The
  // symptom was a round you had definitely joined never appearing.
  const [knownCode] = useState(() => {
    const stashed = takeJoinCode()
    return searchParams.get('code') ?? stashed
  })

  const [code, setCode] = useState(knownCode ?? '')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(!!knownCode)
  // Nothing left to do here — either the request is in and waiting, or the
  // seat is already theirs. Offering the form again would only produce the
  // same message a second time.
  const [done, setDone] = useState(false)

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!captchaToken) {
      setError(t('rounds.waitingForCaptcha'))
      return
    }
    setSubmitting(true)
    try {
      const normalizedCode = code.trim().toUpperCase()
      const ticket = await getTurnstileTicket(captchaToken, 'JOIN_ROUND', normalizedCode)
      const memberId = await joinRound({ code: normalizedCode, turnstileTicket: ticket })
      // The Executive Chef is the only person who can act on a request, and
      // they are running the evening in their head rather than refreshing a
      // roster. Not awaited: the seat is taken either way.
      void notifyHostOfArrival(memberId)
      navigate('/', { replace: true })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      // join_round raises named outcomes rather than prose (0023), because
      // "already a member of this round" was being shown to people who
      // were in fact waiting for approval — accurate about the row, wrong
      // about the situation, and unsayable in a second language.
      const known = t(`rounds.joinErrors.${raw}`, { defaultValue: '' })
      setError(known || raw || t('errors.generic'))

      // Waiting for approval isn't a wrong code, so don't invite a retype.
      // Anything else drops back to the form so a typo can be corrected.
      if (raw === 'AWAITING_APPROVAL' || raw === 'ALREADY_MEMBER') {
        setDone(true)
      } else {
        setConfirming(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stack sheet">
      {/* A code you can't place is a dead end otherwise: this page is often
          reached cold from a link, so BackToTable's fallback (home, i.e. the
          dinners you're already in) is the point rather than the safety net. */}
      <BackToTable />
      <h1>{t('rounds.join')}</h1>
      {error && <div className="error">{error}</div>}

      {done ? (
        <button type="button" onClick={() => navigate('/', { replace: true })}>
          {t('rounds.myRounds')}
        </button>
      ) : confirming ? (
        // Never join silently. Previously a link with ?code= enrolled the
        // visitor the moment the captcha resolved, so you could end up in a
        // dinner without ever agreeing to it — and after a sign-up detour
        // you'd have no idea which dinner you'd just joined.
        <div className="card stack">
          <p>{t('rounds.confirmJoin')}</p>
          <code style={{ fontSize: 20, letterSpacing: '0.08em' }}>{code}</code>
          <div className="row">
            <button type="button" disabled={submitting || !captchaToken} onClick={() => onSubmit()}>
              {t('rounds.confirmJoinYes')}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              {t('rounds.confirmJoinChange')}
            </button>
          </div>
          {!captchaToken && <p className="muted">{t('rounds.waitingForCaptcha')}</p>}
        </div>
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
          <button type="submit" disabled={submitting || !captchaToken}>
            {t('actions.submit')}
          </button>
          {!captchaToken && <p className="muted">{t('rounds.waitingForCaptcha')}</p>}
        </form>
      )}

      <Turnstile onVerify={setCaptchaToken} />
    </div>
  )
}
