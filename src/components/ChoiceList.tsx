import type { ReactNode } from 'react'

export interface Choice {
  value: string
  label: string
  hint?: string
  /** A glyph standing for the option, where it has one. */
  mark?: string
  /** Shown as a pill after the label — "free", a price, "Pro". */
  tag?: ReactNode
  /** Cannot be picked, and says why underneath rather than just refusing. */
  locked?: boolean
  lockedReason?: string
}

/**
 * A list of options as rows you press, not as a <select>.
 *
 * WHY THIS REPLACED EVERY DROPDOWN ON THE CREATION FORM. A select shows one
 * line: the name of the option currently chosen. Every one of these choices is
 * a sentence — "you add chefs by their username, and the code opens nothing" —
 * and the sentence was living in a paragraph *under* the control, describing
 * whichever option happened to be selected. So reading the four ways a dinner
 * can vote meant opening the menu, picking one, closing it, reading the
 * paragraph that appeared, and doing it three more times. The comparison the
 * host is actually making was the one thing the control could not show.
 *
 * Rows show all of them at once, each with its own sentence, and pressing one
 * chooses it. It is also the only shape that can render a locked option
 * honestly — a disabled <option> can carry a name and nothing else, and on
 * mobile Safari half of them are unreadable.
 *
 * Radios underneath rather than buttons with aria-pressed: this is a choice
 * among alternatives, which is what a radio group means, and it arrives with
 * arrow-key navigation and the right screen-reader announcement already made.
 */
export function ChoiceList({
  name,
  options,
  value,
  onChange,
  /** Cap the height at roughly this many rows and scroll inside. For long
   *  shelves — the themes — so the form does not become a page of options. */
  visibleRows,
}: {
  name: string
  options: Choice[]
  value: string
  onChange: (value: string) => void
  visibleRows?: number
}) {
  return (
    <div
      className={`stack shelf${visibleRows ? ' shelf--scroll' : ''}`}
      style={visibleRows ? ({ ['--shelf-rows' as string]: String(visibleRows) }) : undefined}
    >
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`shelf__row${opt.locked ? ' is-locked' : ''}${value === opt.value ? ' is-chosen' : ''}`}
        >
          <input
            type="radio"
            name={name}
            style={{ width: 'auto' }}
            disabled={opt.locked}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.mark && (
            <span className="shelf__mark" aria-hidden="true">
              {opt.mark}
            </span>
          )}
          <span className="shelf__text">
            <span className="shelf__name">
              {opt.label}
              {opt.tag}
            </span>
            {opt.hint && <span className="muted shelf__hint">{opt.hint}</span>}
            {opt.locked && opt.lockedReason && (
              <span className="shelf__locked">{opt.lockedReason}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  )
}
