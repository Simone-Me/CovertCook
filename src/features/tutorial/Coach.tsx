import { useTranslation } from 'react-i18next'

/**
 * The chef who tells the story, one sentence at a time.
 *
 * The app's own face rather than a new character, so the guide is the thing
 * people will see on their home screen afterwards. It stays at the foot of the
 * screen, above the cloth, and never covers the one thing it is pointing at —
 * the page scrolls that into the space above it.
 *
 * "Leave" is on every step. A tour you cannot walk out of is a tour people
 * resent; "skip this step" lands exactly where the press would have, and
 * "previous step" walks back one.
 */
export function Coach({
  say,
  step,
  total,
  canOk,
  canSkip,
  nudge,
  onOk,
  onSkip,
  onPrev,
  onExit,
}: {
  say: string
  step: number
  total: number
  canOk: boolean
  canSkip: boolean
  nudge: boolean
  onOk: () => void
  onSkip: () => void
  /** Absent on the first step. The dinner is drawn from the step number, so
   *  going back is exactly the screen as it was. */
  onPrev?: () => void
  onExit: () => void
}) {
  const { t } = useTranslation()
  return (
    <aside className={`coach${nudge ? ' coach--nudge' : ''}`} aria-live="polite" aria-label={t('tutorial.title')}>
      <img className="coach__face" src="/logo_face.webp" alt="" width={56} height={56} />
      <div className="coach__bubble">
        <p className="coach__say">{say}</p>
        <div className="coach__row">
          {onPrev && (
            <button type="button" className="coach__exit" onClick={onPrev}>
              {t('tutorial.previous')}
            </button>
          )}
          {canOk && (
            <button type="button" className="coach__ok" onClick={onOk}>
              {t('actions.ok')}
            </button>
          )}
          {canSkip && (
            <button type="button" className="secondary coach__skip" onClick={onSkip}>
              {t('tutorial.skip')}
            </button>
          )}
          <button type="button" className="coach__exit" onClick={onExit}>
            {t('tutorial.exit')}
          </button>
          <span className="coach__count" aria-hidden="true">
            {step}/{total}
          </span>
        </div>
      </div>
    </aside>
  )
}
