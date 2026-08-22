import { useTranslation } from 'react-i18next'
import type { RoundRow } from './hooks'

// The database keeps nine phases because the state machine needs that
// precision. A diner does not. Players see three steps, the Executive Chef
// four — LOCKED earns its own only for the host, because for a player it is
// indistinguishable from waiting.
//
// Nothing here changes the phase machine; this is purely how it reads.
const PLAYER_STEPS = ['signup', 'recipe', 'vote'] as const
const HOST_STEPS = ['signup', 'assign', 'recipe', 'vote'] as const

type Step = (typeof HOST_STEPS)[number]

// Which step a phase falls into. RESULTS/ARCHIVED are past the last step
// rather than a step of their own: the evening is over, and the bar hands
// over to the results envelope.
const STEP_OF: Record<string, Step | 'done'> = {
  DRAFT: 'signup',
  OPEN: 'signup',
  LOCKED: 'assign',
  ASSIGNED: 'recipe',
  BRIEFS_CLOSED: 'recipe',
  DINNER: 'recipe',
  VOTING: 'vote',
  RESULTS: 'done',
  ARCHIVED: 'done',
}

export function RoundProgress({ round, isHost }: { round: RoundRow; isHost: boolean }) {
  const { t } = useTranslation()

  // A cancelled dinner has no progress to show, only a fact to state.
  if (round.status === 'CANCELLED') {
    return <p className="muted">{t('rounds.phase.CANCELLED')}</p>
  }

  const steps = (isHost ? HOST_STEPS : PLAYER_STEPS).filter(
    // A step that cannot happen is dropped, not shown and skipped — the
    // same reasoning as visiblePhaseOrder filtering VOTING out today.
    (s) => !(s === 'vote' && round.voting_mode === 'DISABLED'),
  )

  const current = STEP_OF[round.status] ?? 'signup'
  const currentIdx = current === 'done' ? steps.length : steps.indexOf(current as Step)

  return (
    <div>
      <div className="prog__track">
        {steps.map((s, i) => (
          <span
            key={s}
            className={
              i < currentIdx ? 'prog__seg prog__seg--done' : i === currentIdx ? 'prog__seg prog__seg--now' : 'prog__seg'
            }
          />
        ))}
      </div>
      <div className="prog__steps">
        {steps.map((s, i) => (
          <span key={s} className={i === currentIdx ? 'now' : undefined}>
            {t(`rounds.steps.${s}`)}
          </span>
        ))}
      </div>
    </div>
  )
}
