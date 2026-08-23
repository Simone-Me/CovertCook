import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import type { RoundStatus } from '../../lib/rpc'
import { Icon } from '../../components/Icon'

// Everything the Executive Chef is being *asked* to do lives above the
// envelopes, because burying the round's next move inside a drawer made the
// page look like it was waiting for nothing. But three of them stacked open
// pushed the dinner itself off the screen, so each one folds.
//
// `waiting` is for the action the round is actually blocked on: the summary
// takes the accent colour and knocks a few times, then stops. Something that
// never stops asking is something people learn to ignore.
export function HostAction({
  title,
  waiting = false,
  defaultOpen = false,
  children,
}: {
  title: string
  waiting?: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className={`paper action-fold${waiting ? ' action-fold--waiting' : ''}`} open={defaultOpen || waiting}>
      <summary>{title}</summary>
      <div className="stack">{children}</div>
    </details>
  )
}

// One place where the Executive Chef is asked to act, named after the pass —
// the counter a real kitchen calls orders across, where everything goes
// through one person.
//
// Drawn as an envelope like every other drawer, because it IS one: a thing
// laid on the cloth that opens. What sets it apart is colour, not shape — it
// is the only envelope addressed to one person, so it takes the wax red the
// rest of the table only uses for seals. A different shape would have made it
// a different kind of object; a different colour makes it the same object with
// a different job.
//
// The meta line changes with the phase, because "what the pass is for" is a
// different sentence at every stage and a fixed subtitle would be wrong at
// most of them.
export function HostPass({
  status,
  waiting,
  children,
}: {
  status: RoundStatus
  waiting: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <details className={`env env--pass tilt-2${waiting ? ' is-waiting' : ''}`} open={waiting}>
      <summary className="env__face">
        <span className="env__ico" aria-hidden="true">
          <Icon name="pass" size={26} />
        </span>
        <span className="env__txt">
          <span className="env__name">{t('rounds.pass.title')}</span>
          <span className="env__meta">{t(`rounds.pass.phase.${status}`)}</span>
        </span>
        {/* Only when the evening is actually stuck on them. A mark that is
            always there is a mark nobody looks at. */}
        {waiting && (
          <span className="env__pip env__pip--pass" aria-label={t('rounds.pass.needsYou')}>
            <Icon name="chefWrote" size={18} />
          </span>
        )}
      </summary>
      <div className="stack pass">{children}</div>
    </details>
  )
}

// A short line with the long version folded behind it. The late-joiner
// warning used to be three sentences sitting permanently on the page.
export function PassNote({ short, long }: { short: string; long?: string }) {
  if (!long) return <p className="muted pass__note">{short}</p>
  return (
    <details className="pass__note">
      <summary className="muted">{short}</summary>
      <p className="muted">{long}</p>
    </details>
  )
}
