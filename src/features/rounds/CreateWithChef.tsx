import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { InlineConfirm } from '../../components/InlineConfirm'
import {
  applySetup,
  DEFAULT_SETUP,
  eventKind,
  PRESETS,
  setupFromAnswers,
  type EventAnswers,
  type RoundSetup,
} from '../../lib/roundSetup'
import {
  deleteSavedSetup,
  listSavedSetups,
  listTableThemes,
  saveSetup,
  PRO_REQUIRED,
  THEME_LOCKED,
  TOO_MANY_PRESETS,
  type SavedSetup,
} from '../../lib/rpc'
import { ChefSheet } from './ChefSheet'
import { useSetupSummary } from './setupSummary'

type Question = 'codeNames' | 'courses' | 'menuVisible' | 'costs'
const QUESTIONS: Question[] = ['codeNames', 'courses', 'menuVisible', 'costs']

/** Each question's answers, in the order they are offered. The first answer
 *  is the one the classic card would give. */
const CHOICES: Record<Question, { key: string; value: EventAnswers[Question] }[]> = {
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

/** Where the conversation is. `q` is the question on screen while answering. */
type Stage =
  | { at: 'start' }
  | { at: 'saved' }
  | { at: 'questions'; q: number }
  | { at: 'result'; from: 'classic' | 'questions' | 'saved'; title: string; hint: string; setup: RoundSetup }

/**
 * CREATING A DINNER IS A CONVERSATION WITH THE CHEF.
 *
 * It was a grid of cards, then a question about which card; now the chef asks,
 * one line at a time, and every answer is a button the width of the screen with
 * its consequence written under it. Three ways through — the game as designed,
 * four questions about the evening, or a table saved before — and all three
 * end on the same page: what the answers make, the dinner's name, Create, the
 * long form with everything already filled in, and "keep this one" so the next
 * dinner can start from it.
 *
 * NOTHING IS CREATED UNTIL CREATE. Every step before it can be walked back.
 */
export function CreateWithChef() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const summary = useSetupSummary()

  const [stage, setStage] = useState<Stage>({ at: 'start' })
  const [answers, setAnswers] = useState<Partial<EventAnswers>>({})
  const [budget, setBudget] = useState('')
  const [name, setName] = useState('')
  const [keepName, setKeepName] = useState('')
  const [kept, setKept] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: tableThemes } = useQuery({
    queryKey: ['themes', 'table'],
    queryFn: listTableThemes,
    staleTime: 5 * 60 * 1000,
  })
  const { data: mine } = useQuery({ queryKey: ['saved-setups'], queryFn: listSavedSetups })

  /** A saved table, read defensively: it was written by whatever version of
   *  the form was current that day, and a missing field is the normal case. */
  function savedSetup(row: SavedSetup): RoundSetup {
    const setup = { ...DEFAULT_SETUP, ...(row.setup as Partial<RoundSetup>) }
    // A cloth that has left the shelf since it was saved (0094) would make
    // Create fail; the house cloth is what the host meant by "a table".
    if (tableThemes && !tableThemes.some((x) => x.code === setup.tableTheme)) {
      setup.tableTheme = DEFAULT_SETUP.tableTheme
    }
    return setup
  }

  function go(next: Stage) {
    setError(null)
    setKept(false)
    setStage(next)
  }

  function close() {
    // react-router marks entries it created; 'default' means we arrived here
    // directly and there is nothing of ours to go back to.
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }

  function finishQuestions(all: EventAnswers) {
    const kind = eventKind(all)
    go({
      at: 'result',
      from: 'questions',
      title: t(`rounds.questions.kind.${kind}`),
      hint: t(`rounds.questions.kind.${kind}Hint`),
      setup: setupFromAnswers(all),
    })
  }

  function answer(q: Question, value: EventAnswers[Question]) {
    const next = { ...answers, [q]: value }
    setAnswers(next)
    if (q === 'costs' && value === 'BUDGET') return
    const i = QUESTIONS.indexOf(q)
    if (i < QUESTIONS.length - 1) go({ at: 'questions', q: i + 1 })
    else finishQuestions({ ...next, budget } as EventAnswers)
  }

  async function create(setup: RoundSetup) {
    setError(null)
    setBusy(true)
    try {
      const roundId = await applySetup(name, setup)
      navigate(`/rounds/${roundId}`, { replace: true })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const known = raw === THEME_LOCKED ? t('themes.locked') : raw === PRO_REQUIRED ? t('pro.needed') : null
      setError(known ?? (raw || t('errors.generic')))
    } finally {
      setBusy(false)
    }
  }

  async function keep(setup: RoundSetup) {
    if (!profile) return
    setError(null)
    setBusy(true)
    try {
      await saveSetup(profile.id, keepName, setup)
      await queryClient.invalidateQueries({ queryKey: ['saved-setups'] })
      setKept(true)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw.includes(TOO_MANY_PRESETS) ? t('rounds.presets.tooMany') : raw || t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function forget(id: string) {
    setRemoving(null)
    try {
      await deleteSavedSetup(id)
      await queryClient.invalidateQueries({ queryKey: ['saved-setups'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  const saved = mine ?? []

  // ---- 1. What are we making? ----
  if (stage.at === 'start') {
    const classic = PRESETS.find((p) => p.key === 'CLASSIC')!.setup!
    return (
      <ChefSheet step="start" onClose={close}>
        <p className="chefsheet__say">{t('rounds.chef.start')}</p>
        <Answer
          label={t('rounds.presets.CLASSIC')}
          hint={t('rounds.chef.CLASSICHint')}
          onClick={() =>
            go({
              at: 'result',
              from: 'classic',
              title: t('rounds.presets.CLASSIC'),
              hint: t('rounds.presets.CLASSICHint'),
              setup: classic,
            })
          }
        />
        <Answer
          label={t('rounds.presets.QUESTIONS')}
          hint={t('rounds.chef.QUESTIONSHint')}
          onClick={() => go({ at: 'questions', q: 0 })}
        />
        {saved.length > 0 && (
          <Answer
            label={t('rounds.chef.SAVED', { count: saved.length })}
            hint={t('rounds.chef.SAVEDHint')}
            onClick={() => go({ at: 'saved' })}
          />
        )}
        <Answer
          label={t('rounds.presets.MANUAL')}
          hint={t('rounds.chef.MANUALHint')}
          onClick={() => navigate('/rounds/new/custom', { state: { name } })}
        />
        <Answer label={t('rounds.presets.FOR_SOMEONE')} hint={t('rounds.presets.soon')} soon />
      </ChefSheet>
    )
  }

  // ---- 2a. Which saved table? ----
  if (stage.at === 'saved') {
    return (
      <ChefSheet step="saved" onBack={() => go({ at: 'start' })} onClose={close}>
        <p className="chefsheet__say">{t('rounds.chef.savedAsk')}</p>
        {error && <div className="error">{error}</div>}
        {saved.map((row) =>
          removing === row.id ? (
            <InlineConfirm
              key={row.id}
              title={t('rounds.presets.removeAsk', { name: row.name })}
              confirmLabel={t('actions.remove')}
              onConfirm={() => forget(row.id)}
              onCancel={() => setRemoving(null)}
            />
          ) : (
            <div key={row.id} className="chefsheet__saved">
              <Answer
                label={row.name}
                hint={summary(savedSetup(row))}
                onClick={() =>
                  go({
                    at: 'result',
                    from: 'saved',
                    title: row.name,
                    hint: t('rounds.presets.mine'),
                    setup: savedSetup(row),
                  })
                }
              />
              <button
                type="button"
                className="chefsheet__remove"
                aria-label={t('actions.remove')}
                title={t('actions.remove')}
                onClick={() => setRemoving(row.id)}
              >
                ×
              </button>
            </div>
          ),
        )}
      </ChefSheet>
    )
  }

  // ---- 2b. Four questions, one at a time ----
  if (stage.at === 'questions') {
    const q = QUESTIONS[stage.q]
    const waitingForBudget = q === 'costs' && answers.costs === 'BUDGET'
    const budgetOk = /^\d+([.,]\d{1,2})?$/.test(budget.trim())
    return (
      <ChefSheet
        step={q}
        onBack={() => go(stage.q === 0 ? { at: 'start' } : { at: 'questions', q: stage.q - 1 })}
        onClose={close}
      >
        <p className="questions__step">{t('rounds.questions.step', { n: stage.q + 1, total: QUESTIONS.length })}</p>
        <div className="questions__dots" aria-hidden="true">
          {QUESTIONS.map((s, i) => (
            <span key={s} className={i < stage.q ? 'is-done' : i === stage.q ? 'is-now' : undefined} />
          ))}
        </div>
        <p className="chefsheet__say">{t(`rounds.questions.${q}.ask`)}</p>
        {CHOICES[q].map((c) => (
          <Answer
            key={c.key}
            label={t(`rounds.questions.${q}.${c.key}`)}
            hint={t(`rounds.questions.${q}.${c.key}Hint`)}
            picked={answers[q] === c.value}
            onClick={() => answer(q, c.value)}
          />
        ))}
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
                disabled={!budgetOk}
                onClick={() => {
                  const clean = budget.trim().replace(',', '.')
                  setBudget(clean)
                  finishQuestions({ ...answers, budget: clean } as EventAnswers)
                }}
              >
                {t('rounds.questions.continue')}
              </button>
            </div>
          </div>
        )}
      </ChefSheet>
    )
  }

  // ---- 3. What it makes, its name, and Create ----
  const back: Stage =
    stage.from === 'questions'
      ? { at: 'questions', q: QUESTIONS.length - 1 }
      : stage.from === 'saved'
        ? { at: 'saved' }
        : { at: 'start' }
  const named = name.trim().length > 0

  return (
    <ChefSheet step="result" onBack={() => go(back)} onClose={close}>
      <p className="questions__step">{t('rounds.chef.result')}</p>
      <p className="chefsheet__say chefsheet__say--title">{stage.title}</p>
      <p className="chefsheet__hint">{stage.hint}</p>
      <p className="muted chefsheet__summary">{summary(stage.setup)}</p>

      <div>
        <label htmlFor="name">{t('rounds.name')}</label>
        <input
          id="name"
          maxLength={80}
          value={name}
          placeholder={t('rounds.chef.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button type="button" disabled={!named || busy} onClick={() => create(stage.setup)}>
          {t('rounds.createIt')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => navigate('/rounds/new/custom', { state: { name, setup: stage.setup } })}
        >
          {t('rounds.presets.tweak')}
        </button>
      </div>

      {/* Keep it for next time — not for a table that is already kept. */}
      {stage.from !== 'saved' && (
        <details className="chefsheet__keep">
          <summary>{t('rounds.chef.keepAsk')}</summary>
          {kept ? (
            <p className="muted">{t('rounds.chef.kept')}</p>
          ) : (
            <div className="row">
              <input
                aria-label={t('rounds.presets.saveTitle')}
                maxLength={60}
                value={keepName}
                placeholder={t('rounds.presets.namePlaceholder')}
                onChange={(e) => setKeepName(e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                disabled={!keepName.trim() || busy}
                onClick={() => keep(stage.setup)}
              >
                {t('rounds.presets.save')}
              </button>
            </div>
          )}
        </details>
      )}
    </ChefSheet>
  )
}

/** One answer: a button the width of the sheet, its consequence under it. */
export function Answer({
  label,
  hint,
  picked = false,
  soon = false,
  onClick,
  tour,
}: {
  label: string
  hint: string
  picked?: boolean
  soon?: boolean
  onClick?: () => void
  tour?: string
}) {
  return (
    <button
      type="button"
      className={`questions__answer${picked ? ' is-picked' : ''}${soon ? ' is-soon' : ''}`}
      aria-pressed={onClick && !soon ? picked : undefined}
      disabled={soon}
      data-tour={tour}
      onClick={onClick}
    >
      <span className="questions__label">{label}</span>
      <span className="questions__hint">{hint}</span>
    </button>
  )
}
