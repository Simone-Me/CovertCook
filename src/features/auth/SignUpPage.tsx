import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ConfirmEmailNotice } from './ConfirmEmailNotice'
import { Turnstile } from '../../components/Turnstile'
import { useAuth } from '../../lib/auth'
import {
  completeSignup,
  displayNameAvailable,
  type DietaryEntryInput,
  type DietaryKind,
} from '../../lib/rpc'

const DIETARY_KINDS: DietaryKind[] = ['ALLERGY_SEVERE', 'ALLERGY_MILD', 'DIET', 'DISLIKE']

// Long enough that a normal typist isn't asking the server about every
// keystroke, short enough that the answer feels like part of typing.
const NAME_CHECK_DEBOUNCE_MS = 400

type NameState = 'idle' | 'checking' | 'free' | 'taken'

export function SignUpPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { session, needsSignupCompletion, refreshProfile } = useAuth()

  const [step, setStep] = useState<'account' | 'confirm-email' | 'dietary'>(
    session && needsSignupCompletion ? 'dietary' : 'account',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [nameState, setNameState] = useState<NameState>('idle')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedAllergies, setAcceptedAllergies] = useState(false)
  const [hasNoRestrictions, setHasNoRestrictions] = useState(false)
  const [entries, setEntries] = useState<DietaryEntryInput[]>([])

  // The name is an identity now (migration 0046), so the form asks before the
  // submit does. Advisory only: `stale` drops answers that arrive after the
  // person has typed on, and complete_signup re-checks under the unique index
  // for the two people who pick the same name in the same second.
  useEffect(() => {
    const name = displayName.trim()
    if (!name) {
      setNameState('idle')
      return
    }
    setNameState('checking')
    let stale = false
    const id = setTimeout(() => {
      displayNameAvailable(name)
        .then((free) => {
          if (!stale) setNameState(free ? 'free' : 'taken')
        })
        // A failed check must not read as "taken" — that would refuse a name
        // that is free over a dropped connection. Say nothing and let the
        // submit decide.
        .catch(() => {
          if (!stale) setNameState('idle')
        })
    }, NAME_CHECK_DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(id)
    }
  }, [displayName])

  async function onAccountSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!acceptedTerms) {
      setError(t('auth.mustAcceptTerms'))
      return
    }
    if (!acceptedAllergies) {
      setError(t('auth.mustAcceptAllergies'))
      return
    }
    setError(null)
    setSubmitting(true)
    // Without emailRedirectTo, Supabase Auth falls back to the project's Site
    // URL — which is why confirmation links have been pointing at localhost.
    // Saying it explicitly here fixes the half that lives in the app; the
    // other half is the dashboard's redirect allow-list, which has to contain
    // this origin or Auth refuses it and falls back again.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${import.meta.env.VITE_APP_BASE_URL}/`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep(data.session ? 'dietary' : 'confirm-email')
  }

  function addEntry() {
    setEntries((prev) => [...prev, { kind: 'DIET', label: '' }])
  }

  function updateEntry(index: number, patch: Partial<DietaryEntryInput>) {
    setEntries((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  async function onDietarySubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (nameState === 'taken') {
      setError(t('auth.name.taken'))
      return
    }

    if (!hasNoRestrictions && entries.filter((it) => it.label.trim()).length === 0) {
      setError(t('dietary.required'))
      return
    }

    setSubmitting(true)
    try {
      await completeSignup({
        displayName,
        locale: i18n.language.startsWith('en') ? 'en' : 'fr',
        hasNoRestrictions,
        dietaryEntries: entries.filter((it) => it.label.trim()),
      })
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      // profiles.id references auth.users(id), so this particular violation
      // means one thing: the signed-in token belongs to an account that no
      // longer exists. AuthProvider clears such sessions on load, but a tab
      // already open when the account vanished only finds out here. Say
      // what happened instead of forwarding Postgres's constraint name.
      if (message.includes('display_name_taken')) {
        // Somebody took it between the check and the submit.
        setNameState('taken')
        setError(t('auth.name.taken'))
      } else {
        setError(message.includes('profiles_id_fkey') ? t('auth.staleSession') : message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'confirm-email') {
    return <ConfirmEmailNotice email={email} />
  }

  if (step === 'dietary') {
    return (
      <div className="stack sheet">
        <LanguageSwitch />
        <h1>{t('dietary.title')}</h1>
        <p className="muted">{t('dietary.help')}</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={onDietarySubmit} className="stack">
          <div>
            <label htmlFor="displayName">{t('auth.displayName')}</label>
            <input
              id="displayName"
              required
              minLength={1}
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={nameState === 'free' ? 'is-free' : nameState === 'taken' ? 'is-taken' : ''}
              aria-invalid={nameState === 'taken'}
              aria-describedby="displayName-status"
            />
            {/* The border carries the answer, but never alone: colour is not
                readable to everyone, and "taken" is the kind of thing a person
                needs in words before they retype. */}
            <p id="displayName-status" className={`field-status is-${nameState}`}>
              {nameState !== 'idle' && t(`auth.name.${nameState}`)}
            </p>
            <p className="muted">{t('auth.name.changeLater')}</p>
          </div>

          <label className="row">
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={hasNoRestrictions}
              onChange={(e) => setHasNoRestrictions(e.target.checked)}
            />
            {t('dietary.noRestrictions')}
          </label>

          {!hasNoRestrictions && (
            <div className="stack">
              {entries.map((entry, i) => (
                <div key={i} className="card">
                  <label htmlFor={`kind-${i}`}>{t('dietary.kind.DIET')}</label>
                  <select
                    id={`kind-${i}`}
                    value={entry.kind}
                    onChange={(e) => updateEntry(i, { kind: e.target.value as DietaryKind })}
                  >
                    {DIETARY_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`dietary.kind.${k}`)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`label-${i}`}>{t('dietary.label')}</label>
                  <input
                    id={`label-${i}`}
                    required
                    value={entry.label}
                    onChange={(e) => updateEntry(i, { label: e.target.value })}
                  />
                  <label htmlFor={`note-${i}`}>{t('dietary.note')}</label>
                  <input
                    id={`note-${i}`}
                    value={entry.note ?? ''}
                    onChange={(e) => updateEntry(i, { note: e.target.value })}
                  />
                  <button type="button" className="secondary" onClick={() => removeEntry(i)}>
                    {t('actions.cancel')}
                  </button>
                </div>
              ))}
              <button type="button" className="secondary" onClick={addEntry}>
                {t('dietary.addEntry')}
              </button>
            </div>
          )}

          <button type="submit" disabled={submitting || nameState === 'taken'}>
            {t('actions.submit')}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="stack sheet">
      <LanguageSwitch />
      <h1>{t('auth.signUp')}</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={onAccountSubmit} className="stack">
        <div>
          <label htmlFor="email">{t('auth.email')}</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password">{t('auth.password')}</label>
          <input
            id="password"
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {/* Consent has to be given, not assumed. A pre-ticked box or a line
            of small print saying "by continuing you agree" is not agreement —
            and this is the only moment where asking is honest, because after
            the account exists the person has already handed over their data.
            Required, so the browser blocks the submit rather than the server
            explaining it afterwards. */}
        <label className="row">
          <input
            type="checkbox"
            required
            style={{ width: 'auto' }}
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>
            <Trans
              i18nKey="auth.acceptTerms"
              components={{
                terms: <Link to="/legal/terms" target="_blank" />,
                privacy: <Link to="/legal/privacy" target="_blank" />,
              }}
            />
          </span>
        </label>

        {/* The second box, and the one that matters most. It does two jobs
            that happen to be the same sentence: it is the explicit consent
            GDPR Article 9 requires before an app may hold health data, and it
            is the undertaking that makes the dietary panel worth collecting at
            all — a list nobody promises to read protects nobody.
            Separate from the terms box on purpose: bundling consent to health
            data into a general "I agree" is exactly what Article 9 does not
            allow. */}
        <label className="row signup__allergy">
          <input
            type="checkbox"
            required
            style={{ width: 'auto' }}
            checked={acceptedAllergies}
            onChange={(e) => setAcceptedAllergies(e.target.checked)}
          />
          <span>{t('auth.acceptAllergies')}</span>
        </label>

        <Turnstile onVerify={setCaptchaToken} />
        <button type="submit" disabled={submitting || !acceptedTerms || !acceptedAllergies}>
          {t('auth.signUp')}
        </button>
      </form>
      <p className="muted">
        {t('auth.hasAccount')} <Link to="/signin">{t('auth.signIn')}</Link>
      </p>
    </div>
  )
}
