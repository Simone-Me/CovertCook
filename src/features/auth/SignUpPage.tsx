import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Turnstile } from '../../components/Turnstile'
import { useAuth } from '../../lib/auth'
import { completeSignup, type DietaryEntryInput, type DietaryKind } from '../../lib/rpc'

const DIETARY_KINDS: DietaryKind[] = ['ALLERGY_SEVERE', 'ALLERGY_MILD', 'DIET', 'DISLIKE']

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
  const [hasNoRestrictions, setHasNoRestrictions] = useState(false)
  const [entries, setEntries] = useState<DietaryEntryInput[]>([])

  async function onAccountSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
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
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'confirm-email') {
    return (
      <div className="stack">
        <h1>{t('auth.signUp')}</h1>
        <p>{t('auth.resetSent')}</p>
      </div>
    )
  }

  if (step === 'dietary') {
    return (
      <div className="stack">
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
            />
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

          <button type="submit" disabled={submitting}>
            {t('actions.submit')}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="stack">
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
        <Turnstile onVerify={setCaptchaToken} />
        <button type="submit" disabled={submitting}>
          {t('auth.signUp')}
        </button>
      </form>
      <p className="muted">
        {t('auth.hasAccount')} <Link to="/signin">{t('auth.signIn')}</Link>
      </p>
    </div>
  )
}
