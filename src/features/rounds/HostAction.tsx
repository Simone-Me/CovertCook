import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

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
// Several separate panels each explaining themselves in a paragraph filled
// the screen before the dinner appeared, and long explanations stacked
// vertically are read by nobody. Here the sections are short, and anything
// that needs a paragraph is a `note` you open rather than a wall you scroll.
export function HostPass({ waiting, children }: { waiting: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <details className={`paper action-fold${waiting ? ' action-fold--waiting' : ''}`} open={waiting}>
      <summary>{t('rounds.pass.title')}</summary>
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
