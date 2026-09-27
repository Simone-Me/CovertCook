import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { eventKind, setupFromAnswers, type EventAnswers, type RoundSetup } from '../../lib/roundSetup'

type Step = 'codeNames' | 'courses' | 'menuVisible' | 'costs'
const STEPS: Step[] = ['codeNames', 'courses', 'menuVisible', 'costs']

/** Each question's answers, in the order they are offered, and what each one
 *  sets. The first answer is the one the classic card would give. */
const CHOICES: Record<Step, { key: string; value: EventAnswers[Step] }[]> = {
  codeNames: [
    { key: 'yes', value: true },
    { key: 'no', value: false },
  ],
  courses: [
    { key: 'yes', value: true },
    { key: 'no', value: false },
  ],
  menuVisible: [
    { key: 'no', value: false },
    { key: 'yes', value: true },
  ],
  costs: [
    { key: 'OWN', value: 'OWN' },
    { key: 'SHARED', value: 'SHARED' },
    { key: 'BUDGET', value: 'BUDGET' },
  ],
}

/**
 * The evening, asked about one question at a time, inside the card that was
 * pressed.
 *
 * ONE QUESTION ON SCREEN. Four at once is a form again, and a form is what this
 * card exists to avoid. Pressing an answer moves on by itself; the only answer
 * that waits is the budget, because it needs a number typed first.
 *
 * NOTHING IS CREATED HERE. The end is the same as every other card: what the
 * answers make, said in words, then Create — or the long form with the answers
 * already in it, for the host who wants one more thing.
 */
export function EventQuestions({
  named,
  submitting,
  summary,
  onCreate,
  onTweak,
}: {
  named: boolean
  submitting: boolean
  summary: (setup: RoundSetup) => string
  onCreate: (setup: RoundSetup) => void
  onTweak: (setup: RoundSetup) => void
}) {
  const { t } = useTranslation()
  const [at, setAt] = useState(0)
  const [answers, setAnswers] = useState<Partial<EventAnswers>>({})
  const [budget, setBudget] = useState('')

  const done = at >= STEPS.length

  function answer(step: Step, value: EventAnswers[Step]) {
    setAnswers((cur) => ({ ...cur, [step]: value }))
    if (!(step === 'costs' && value === 'BUDGET')) setAt((n) => n + 1)
  }

  if (done) {
    const full = { ...answers, budget } as EventAnswers
    const kind = eventKind(full)
    const setup = setupFromAnswers(full)
    return (
      <div className="stack questions">
        <p className="questions__step">{t('rounds.questions.result')}</p>
        <strong className="questions__kind">{t(`rounds.questions.kind.${kind}`)}</strong>
        <p className="setup__what">{t(`rounds.questions.kind.${kind}Hint`)}</p>
        <p className="muted setup__summary">{summary(setup)}</p>
        <div className="row">
          <button type="button" disabled={!named || submitting} onClick={() => onCreate(setup)}>
            {t('rounds.createIt')}
          </button>
          <button type="button" className="secondary" onClick={() => onTweak(setup)}>
            {t('rounds.presets.tweak')}
          </button>
        </div>
        {!named && <p className="muted setup__summary">{t('rounds.presets.nameFirst')}</p>}
        <button type="button" className="questions__back" onClick={() => setAt(0)}>
          ↺ {t('rounds.questions.restart')}
        </button>
      </div>
    )
  }

  const step = STEPS[at]
  const waitingForBudget = step === 'costs' && answers.costs === 'BUDGET'

  return (
    <div className="stack questions">
      <p className="questions__step">
        {t('rounds.questions.step', { n: at + 1, total: STEPS.length })}
      </p>
      <div className="questions__dots" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={i < at ? 'is-done' : i === at ? 'is-now' : undefined} />
        ))}
      </div>
      <strong className="questions__ask">{t(`rounds.questions.${step}.ask`)}</strong>

      <div className="stack">
        {CHOICES[step].map((c) => {
          const picked = answers[step] === c.value
          return (
            <button
              key={c.key}
              type="button"
              className={`questions__answer${picked ? ' is-picked' : ''}`}
              aria-pressed={picked}
              onClick={() => answer(step, c.value)}
            >
              <span className="questions__label">{t(`rounds.questions.${step}.${c.key}`)}</span>
              <span className="questions__hint">{t(`rounds.questions.${step}.${c.key}Hint`)}</span>
            </button>
          )
        })}
      </div>

      {waitingForBudget && (
        <div className="stack">
          <label htmlFor="q-budget">{t('rounds.questions.costs.perHead')}</label>
          <div className="row">
            <input
              id="q-budget"
              inputMode="decimal"
              autoComplete="off"
              placeholder="15"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <button
              type="button"
              disabled={!/^\d+([.,]\d{1,2})?$/.test(budget.trim())}
              onClick={() => {
                setBudget(budget.trim().replace(',', '.'))
                setAt((n) => n + 1)
              }}
            >
              {t('rounds.questions.continue')}
            </button>
          </div>
        </div>
      )}

      {at > 0 && (
        <button type="button" className="questions__back" onClick={() => setAt((n) => n - 1)}>
          ← {t('rounds.questions.previous')}
        </button>
      )}
    </div>
  )
}
