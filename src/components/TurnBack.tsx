import type { ReactNode } from 'react'

/**
 * The turning arrow: go back on a choice already made.
 *
 * It began life inside the phase menu, where it un-serves the last course, and
 * then grew a second copy in the menu panel for swapping a course. It is now
 * the app's one gesture for "revisit this decision", so it lives here rather
 * than being redrawn at each site — the animation matters as much as the
 * glyph, and two hand-copied versions would drift apart.
 *
 * IT ONLY OFFERS. Pressing it opens whatever the caller renders underneath —
 * a picker, a confirmation — and that is what acts. Going back on something a
 * table is already living with should never be one mis-tap away, and the arrow
 * spinning to face the other way is the whole of the feedback: armed, and
 * waiting for a second, deliberate act.
 */
export function TurnBack({
  open,
  label,
  onToggle,
}: {
  open: boolean
  /** Said out loud by a screen reader and shown on hover — it is the only
   *  text the control has, so it names the decision, not the direction. */
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`menucard__turn${open ? ' is-open' : ''}`}
      aria-expanded={open}
      title={label}
      aria-label={label}
      onClick={onToggle}
    >
      ↺
    </button>
  )
}

/**
 * The arrow with its heading and whatever it opens, as one row.
 *
 * Used where the arrow sits beside a setting rather than beside a list item:
 * the closed state shows the answer currently in force, and the open state
 * shows the way to change it. Without the closed line the control would be an
 * arrow pointing at nothing.
 */
export function TurnBackRow({
  title,
  answer,
  open,
  label,
  onToggle,
  children,
}: {
  title: string
  answer: string
  open: boolean
  label: string
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="turnrow">
      <div className="turnrow__head">
        <span className="turnrow__text">
          <span className="turnrow__title">{title}</span>
          <span className="turnrow__answer">{answer}</span>
        </span>
        <TurnBack open={open} label={label} onToggle={onToggle} />
      </div>
      {open && <div className="stack turnrow__body">{children}</div>}
    </div>
  )
}
