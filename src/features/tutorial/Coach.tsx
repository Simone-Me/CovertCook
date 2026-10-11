import { useTranslation } from 'react-i18next'

/**
 * The chef who tells the story, one sentence at a time.
 *
 * The app's own face rather than a new character, so the guide is the thing
 * people will see on their home screen afterwards. It stays at the foot of the
 * screen, above the cloth, and never covers the one thing it is pointing at —
 * the page scrolls that into the space above it.
 *
 * Three marks and no words: ⊗ in the corner leaves (on every step — a tour
 * you cannot walk out of is a tour people resent), ← walks back one, and →
 * goes on — but only on a step with nothing to press. Where the chef points at
 * something, pressing it is the way on: the tour is there to be clicked
 * through, so it offers no skip. Labels stay for screen readers.
 */
export function Coach({
  say,
  step,
  total,
  canOk,
  nudge,
  onOk,
  onPrev,
  onExit,
}: {
  say: string
  step: number
  total: number
  canOk: boolean
  nudge: boolean
  onOk: () => void
  /** Absent on the first step. The dinner is drawn from the step number, so
   *  going back is exactly the screen as it was. */
  onPrev?: () => void
  onExit: () => void
}) {
  const { t } = useTranslation()
  return (
    <aside className={`coach${nudge ? ' coach--nudge' : ''}`} aria-live="polite" aria-label={t('tutorial.title')}>
      <img className="coach__face" src="/logos/hat-red-on-white.png" alt="" width={56} height={56} />
      <div className="coach__bubble">
        <button
          type="button"
          className="coach__close"
          onClick={onExit}
          aria-label={t('tutorial.exit')}
          title={t('tutorial.exit')}
        >
          ×
        </button>
        <p className="coach__say">{say}</p>
        <div className="coach__row">
          {onPrev ? (
            <button
              type="button"
              className="secondary coach__arrow"
              onClick={onPrev}
              aria-label={t('tutorial.previous')}
              title={t('tutorial.previous')}
            >
              ←
            </button>
          ) : (
            <span className="coach__arrow-gap" aria-hidden="true" />
          )}
          <span className="coach__count" aria-hidden="true">
            {step}/{total}
          </span>
          {/* Only on a step with nothing to press: everywhere else the way on
              is the thing the chef is pointing at, which is the whole point
              of the tour — so there is no skipping past it. */}
          {canOk ? (
            <button
              type="button"
              className="coach__arrow"
              onClick={onOk}
              aria-label={t('actions.ok')}
              title={t('actions.ok')}
            >
              →
            </button>
          ) : (
            <span className="coach__arrow-gap" aria-hidden="true" />
          )}
        </div>
      </div>
    </aside>
  )
}
