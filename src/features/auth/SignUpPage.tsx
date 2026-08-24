import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ConfirmEmailNotice } from './ConfirmEmailNotice'
import { Turnstile } from '../../components/Turnstile'
import { FoodTagGrid } from '../../components/FoodTagGrid'
import { ALLERGENS, DIETS, OTHER_CODE } from '../../lib/foodTags'
import { PasswordField } from '../../components/PasswordField'
import { checkPassword, LONG_ENOUGH_ALONE, MIN_WITH_CLASSES } from '../../lib/password'
import { useAuth } from '../../lib/auth'
import {
  completeSignup,
  displayNameAvailable,
  type DietaryEntryInput,
  type DietaryKind,
} from '../../lib/rpc'

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
  const [passwordAgain, setPasswordAgain] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [nameState, setNameState] = useState<NameState>('idle')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedAllergies, setAcceptedAllergies] = useState(false)
  // Two questions, each answered before its grid appears. Null is "not asked
  // yet" and is why the submit can insist on an answer: walking past the
  // screen must not be the same as saying no.
  const [hasAllergies, setHasAllergies] = useState<boolean | null>(null)
  const [hasDiet, setHasDiet] = useState<boolean | null>(null)
  const [allergyCodes, setAllergyCodes] = useState<string[]>([])
  const [dietCodes, setDietCodes] = useState<string[]>([])
  const [typedAllergies, setTypedAllergies] = useState<string[]>([])
  // The name used to sit above the food questions and the two would not read
  // as one page: one asks who you are, the other what you cannot eat. They are
  // two pages now, food first, because the food is the part somebody came to
  // answer and the name is the last thing before confirming.
  const [profileStep, setProfileStep] = useState<'food' | 'name'>('food')

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
    if (!checkPassword(password).valid) {
      setError(t('auth.password.tooWeak'))
      return
    }
    if (password !== passwordAgain) {
      setError(t('auth.password.mismatch'))
      return
    }
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
        // The confirmation mail is rendered before a profile exists, so the
        // only place the send-email hook can learn a language is here.
        data: { locale: i18n.language.startsWith('en') ? 'en' : 'fr' },
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

  // Answered by the Continue button and again at submit: the second is not
  // paranoia, it is what stops a state change on the last page from letting an
  // unanswered question through.
  function validateFood(): string | null {
    if (hasAllergies === null || hasDiet === null) return t('food.answerBoth')
    // Saying yes and then choosing nothing is the one answer that means
    // neither thing: it is not "no", and it records nothing a cook can use.
    if ((hasAllergies || hasDiet) && buildEntries().length === 0) return t('food.pickOne')
    return null
  }

  function toggle(list: string[], set: (v: string[]) => void, code: string) {
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code])
  }

  // Every allergen the grid records is severe (ROADMAP §8): a two-way switch
  // invites the under-reading it is supposed to capture, because nobody wants
  // to be the person marking themselves serious.
  function buildEntries(): DietaryEntryInput[] {
    const allergens = allergyCodes
      .filter((c) => c !== OTHER_CODE)
      .map((code) => ({ kind: 'ALLERGY_SEVERE' as DietaryKind, label: code }))
    const typed = typedAllergies.map((label) => ({ kind: 'ALLERGY_SEVERE' as DietaryKind, label }))
    const diets = dietCodes
      .filter((c) => c !== OTHER_CODE)
      .map((code) => ({ kind: 'DIET' as DietaryKind, label: code }))
    return [...allergens, ...typed, ...diets]
  }

  async function onDietarySubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (nameState === 'taken') {
      setError(t('auth.name.taken'))
      return
    }

    const foodProblem = validateFood()
    if (foodProblem) {
      setError(foodProblem)
      setProfileStep('food')
      return
    }

    const dietaryEntries = buildEntries()
    const noneDeclared = dietaryEntries.length === 0

    setSubmitting(true)
    try {
      await completeSignup({
        displayName,
        locale: i18n.language.startsWith('en') ? 'en' : 'fr',
        hasNoRestrictions: noneDeclared,
        dietaryEntries,
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

  // Reusing the field-status colours the name check introduced: green when a
  // rule is met, red when it is actively wrong, silent while nothing has been
  // typed. Nobody should be told they are wrong before they have started.
  const passwordState = !password ? 'idle' : checkPassword(password).valid ? 'free' : 'taken'
  const confirmState = !passwordAgain ? 'idle' : password === passwordAgain ? 'free' : 'taken'

  if (step === 'confirm-email') {
    return <ConfirmEmailNotice email={email} />
  }

  if (step === 'dietary') {
    return (
      <div className="stack sheet">
        <LanguageSwitch />
        <h1>{t(profileStep === 'food' ? 'dietary.title' : 'auth.name.pageTitle')}</h1>
        <p className="muted">{t(profileStep === 'food' ? 'dietary.help' : 'auth.name.pageHelp')}</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={onDietarySubmit} className="stack">
          {profileStep === 'food' ? (
            <>

          {/* Two questions, in pictures. The form they replace asked somebody
              to type their own allergens: whatever spelling came to mind, in
              whichever language, and it left them to remember that celery is
              an allergen at all. A grid says so for them — and stores a code,
              so celery and celeri stop being two different allergens. */}
          <fieldset className="ask">
            <legend>{t('food.allergyQuestion')}</legend>
            <p className="muted">{t('food.allergyHelp')}</p>
            <div className="row">
              <button
                type="button"
                className={hasAllergies === true ? '' : 'secondary'}
                aria-pressed={hasAllergies === true}
                onClick={() => setHasAllergies(true)}
              >
                {t('food.yes')}
              </button>
              <button
                type="button"
                className={hasAllergies === false ? '' : 'secondary'}
                aria-pressed={hasAllergies === false}
                onClick={() => {
                  setHasAllergies(false)
                  setAllergyCodes([])
                  setTypedAllergies([])
                }}
              >
                {t('food.no')}
              </button>
            </div>
            {hasAllergies && (
              <FoodTagGrid
                tags={ALLERGENS}
                selected={allergyCodes}
                onToggle={(code) => toggle(allergyCodes, setAllergyCodes, code)}
                namespace="food.allergen"
                otherValues={typedAllergies}
                onOtherAdd={(v) => setTypedAllergies((prev) => [...prev, v])}
                onOtherRemove={(v) => setTypedAllergies((prev) => prev.filter((x) => x !== v))}
              />
            )}
            {typedAllergies.length > 0 && (
              <p className="muted">{t('food.typedNotChecked')}</p>
            )}
          </fieldset>

          <fieldset className="ask">
            <legend>{t('food.dietQuestion')}</legend>
            <p className="muted">{t('food.dietHelp')}</p>
            <div className="row">
              <button
                type="button"
                className={hasDiet === true ? '' : 'secondary'}
                aria-pressed={hasDiet === true}
                onClick={() => setHasDiet(true)}
              >
                {t('food.yes')}
              </button>
              <button
                type="button"
                className={hasDiet === false ? '' : 'secondary'}
                aria-pressed={hasDiet === false}
                onClick={() => {
                  setHasDiet(false)
                  setDietCodes([])
                }}
              >
                {t('food.no')}
              </button>
            </div>
            {hasDiet && (
              <FoodTagGrid
                tags={DIETS}
                selected={dietCodes}
                onToggle={(code) => toggle(dietCodes, setDietCodes, code)}
                namespace="food.diet"
              />
            )}
          </fieldset>

              <button
                type="button"
                onClick={() => {
                  const problem = validateFood()
                  if (problem) {
                    setError(problem)
                    return
                  }
                  setError(null)
                  setProfileStep('name')
                }}
              >
                {t('actions.next')}
              </button>
            </>
          ) : (
            <>
          <div>
            <label htmlFor="displayName">{t('auth.displayName')}</label>
            {/* The one place these two names can be confused, so it is said
                here rather than discovered mid-dinner: this is the person,
                the secret name is the player. */}
            <p className="muted">{t('auth.name.whatItIs')}</p>
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

              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setError(null)
                  setProfileStep('food')
                }}
              >
                {t('actions.back')}
              </button>
              <button type="submit" disabled={submitting || nameState !== 'free'}>
                {t('actions.submit')}
              </button>
            </>
          )}
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
        <PasswordField
          id="password"
          label={t('auth.passwordLabel')}
          value={password}
          onChange={setPassword}
          describedBy="password-rules"
        />
        {/* The rules, before they are broken rather than after. Two routes,
            both stated, because "at least one uppercase" on its own teaches
            people to end their password with an exclamation mark. */}
        <p id="password-rules" className={`field-status is-${passwordState}`}>
          {t('auth.password.rules', { classes: MIN_WITH_CLASSES, alone: LONG_ENOUGH_ALONE })}
        </p>

        <PasswordField
          id="password-again"
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
        <button
          type="submit"
          disabled={
            submitting ||
            !acceptedTerms ||
            !acceptedAllergies ||
            passwordState !== 'free' ||
            confirmState !== 'free'
          }
        >
          {t('auth.signUp')}
        </button>
      </form>
      <p className="muted">
        {t('auth.hasAccount')} <Link to="/signin">{t('auth.signIn')}</Link>
      </p>
    </div>
  )
}
