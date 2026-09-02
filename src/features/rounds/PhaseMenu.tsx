import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { visiblePhaseOrder, ROUND_PHASE_ORDER, type RoundStatus } from '../../lib/rpc'
import { InlineConfirm } from '../../components/InlineConfirm'
import { TurnBack } from '../../components/TurnBack'

/**
 * The dinner's phases, written as a menu card.
 *
 * A dropdown reading "Current phase: ASSIGNED" told the host one fact and hid
 * the shape of the evening. A menu shows the whole meal at once: the courses
 * already served are struck through, the one being plated is marked, the rest
 * are still to come. Where you are is then a thing you see rather than a thing
 * you read.
 *
 * Going back is two gestures. The arrow only *offers*; the warning it opens is
 * what carries the OK. Stepping a dinner backwards is rare and it changes what
 * other people can do, so it should never be one mis-tap away.
 *
 * The warning opens BETWEEN the course being un-served and the one you are
 * leaving, because that gap is exactly what it describes — reading it in place
 * is easier than reading it detached at the bottom of the card, and far easier
 * than reading it in a browser dialog that has torn you out of the page.
 */
export function PhaseMenu({
  status,
  votingEnabled,
  previousPhase,
  stepping,
  onStepBack,
}: {
  status: RoundStatus
  votingEnabled: boolean
  previousPhase: RoundStatus | null
  stepping: boolean
  onStepBack: () => void
}) {
  const { t } = useTranslation()
  const [offering, setOffering] = useState(false)

  const phases = visiblePhaseOrder(votingEnabled)
  const currentIdx = phases.indexOf(status)

  return (
    <div className="menucard">
      <p className="menucard__head">{t('rounds.settings.phaseControl')}</p>

      <ol className="menucard__list">
        {phases.map((phase, i) => {
          const done = currentIdx >= 0 && i < currentIdx
          const now = i === currentIdx
          // The arrow belongs beside the last course actually served: that is
          // the one a step back un-serves, so it is the one to point at.
          const isLastDone = done && i === currentIdx - 1
          return (
            <li key={phase} className="menucard__row">
              <div className={`menucard__course${done ? ' is-done' : ''}${now ? ' is-now' : ''}`}>
                <span className="menucard__name">{t(`rounds.phase.${phase}`)}</span>

                {isLastDone && previousPhase && (
                  <TurnBack
                    open={offering}
                    label={t('rounds.settings.stepBackTo', { phase: t(`rounds.phase.${previousPhase}`) })}
                    onToggle={() => setOffering((v) => !v)}
                  />
                )}
              </div>

              {/* Sits in the gap it is about: under the course you would go
                  back to, above the one you would leave. */}
              {isLastDone && offering && previousPhase && (
                <InlineConfirm
                  title={t('rounds.settings.stepBackTo', { phase: t(`rounds.phase.${previousPhase}`) })}
                  busy={stepping}
                  onConfirm={() => {
                    // Close first. The component is not unmounted by the phase
                    // change, so leaving this open left the card showing a
                    // fresh offer to step back AGAIN — which read as though
                    // the first one had not worked.
                    setOffering(false)
                    onStepBack()
                  }}
                  onCancel={() => setOffering(false)}
                >
                  {/* What actually changes, per destination. Written from the
                      phase machine (0006), which on a backward step only
                      updates rounds.status — so none of these say anything is
                      deleted, because nothing is. */}
                  <p className="confirmbox__why">{t(`rounds.settings.stepBackWhat.${previousPhase}`)}</p>
                  <p className="confirmbox__safe">{t('rounds.settings.stepBackNothingLost')}</p>
                </InlineConfirm>
              )}
            </li>
          )
        })}
      </ol>

      {!previousPhase && <p className="muted menucard__note">{t('rounds.settings.noStepBack')}</p>}

      {/* CANCELLED is not on the menu — it is not a course, it is the evening
          being called off — so say it plainly instead of leaving the card
          looking as though nothing has started. */}
      {ROUND_PHASE_ORDER.indexOf(status) === -1 && (
        <p className="muted menucard__note">{t(`rounds.phase.${status}`)}</p>
      )}
    </div>
  )
}
