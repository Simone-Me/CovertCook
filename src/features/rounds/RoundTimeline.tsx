import { useTranslation } from 'react-i18next'
import { visiblePhaseOrder } from '../../lib/rpc'
import type { RoundRow } from './hooks'

// A quick-glance progress list for every player, not just the host — the
// state machine has more steps than are obvious from a single phase badge
// (locking a round, closing briefs, and archiving are all separate host
// actions, not automatic). VOTING is omitted entirely for
// voting_enabled=false rounds, matching how advance_phase actually treats
// them (DINNER -> RESULTS directly, VOTING is never entered).
export function RoundTimeline({ round }: { round: RoundRow }) {
  const { t } = useTranslation()

  if (round.status === 'CANCELLED') {
    return <p className="muted">{t('rounds.phase.CANCELLED')}</p>
  }

  const phases = visiblePhaseOrder(round.voting_enabled)
  const currentIdx = phases.indexOf(round.status)

  return (
    <ol className="timeline">
      {phases.map((phase, i) => (
        <li key={phase} className={i < currentIdx ? 'done' : i === currentIdx ? 'current' : undefined}>
          {t(`rounds.phase.${phase}`)}
        </li>
      ))}
    </ol>
  )
}
