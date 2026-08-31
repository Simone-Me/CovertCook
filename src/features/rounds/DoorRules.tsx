import { useTranslation } from 'react-i18next'
import { Fold } from '../../components/Fold'
import { ChoiceList } from '../../components/ChoiceList'

// Kept in step with rounds_max_players_sane (0020). Three is where a chain
// stops being a swap; thirty is where the secret-name list runs out and people
// start being numbered instead of named.
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 30

// One past the ceiling, and it is the whole trick of the slider: pushed all
// the way right, the dinner has no cap at all. Two controls — a tick for
// "limit it" and a number for how much — were one question asked twice, and
// the tick was the half nobody read.
const NO_LIMIT = MAX_PLAYERS + 1

/**
 * Who gets through the door: how many, and whether you wave them in.
 *
 * The two settings were on opposite ends of the form — a tick in the fixed box
 * saying the Executive Chef approves each player, and a tick plus a number
 * field below every other control for the seat cap — and they are obviously
 * one subject. A host thinking about the size of their table is thinking about
 * the door.
 *
 * Both are settled at creation, and that is not a style choice: there is no
 * RPC that changes `max_players` or `requires_approval` on a live round, so
 * this belongs in the box of things that cannot be revisited.
 */
export function DoorRules({
  seats,
  onSeats,
  requiresApproval,
  onRequiresApproval,
}: {
  /** Null means no cap. */
  seats: number | null
  onSeats: (seats: number | null) => void
  requiresApproval: boolean
  onRequiresApproval: (value: boolean) => void
}) {
  const { t } = useTranslation()
  const position = seats ?? NO_LIMIT
  const unlimited = seats === null

  const answer = [
    unlimited ? t('rounds.door.noLimit') : t('rounds.door.seats', { count: seats as number }),
    t(requiresApproval ? 'rounds.door.APPROVE' : 'rounds.door.FREE'),
  ].join(' · ')

  return (
    <Fold title={t('rounds.door.label')} aside={answer}>
      <div className="stack">
        <label htmlFor="seats">{t('rounds.maxPlayers')}</label>

        {/* The number reads above the slider rather than beside it, big enough
            to be the thing you are watching while you drag: on a phone your
            thumb is over the track and a value tucked at the end of the row is
            under your own hand. */}
        <p className={`seatcount${unlimited ? ' is-open' : ''}`} aria-hidden="true">
          {unlimited ? t('rounds.door.noLimit') : seats}
        </p>

        <input
          id="seats"
          type="range"
          className="seatslider"
          min={MIN_PLAYERS}
          max={NO_LIMIT}
          step={1}
          value={position}
          onChange={(e) => {
            const next = Number(e.target.value)
            onSeats(next > MAX_PLAYERS ? null : next)
          }}
          aria-valuetext={
            unlimited ? t('rounds.door.noLimit') : t('rounds.door.seats', { count: seats as number })
          }
        />

        <div className="row seatslider__ends" aria-hidden="true">
          <span className="muted">{MIN_PLAYERS}</span>
          <span className="muted">{t('rounds.door.noLimit')}</span>
        </div>

        <p className="muted" style={{ margin: 0 }}>
          {t(unlimited ? 'rounds.door.noLimitHint' : 'rounds.door.seatsHint', {
            count: seats ?? MAX_PLAYERS,
            max: MAX_PLAYERS,
          })}
        </p>

        <ChoiceList
          name="door-approval"
          value={requiresApproval ? 'APPROVE' : 'FREE'}
          onChange={(v) => onRequiresApproval(v === 'APPROVE')}
          options={(['APPROVE', 'FREE'] as const).map((code) => ({
            value: code,
            label: t(`rounds.door.${code}`),
            hint: t(`rounds.door.${code}Hint`),
          }))}
        />
      </div>
    </Fold>
  )
}
