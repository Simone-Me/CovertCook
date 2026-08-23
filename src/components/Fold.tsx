import type { ReactNode } from 'react'

/**
 * A heading that folds. Settings pages had grown into one long scroll where
 * every option shouted at once — the way to read them is one at a time, so
 * they arrive closed and you open the one you came for.
 *
 * Built on <details>/<summary> rather than a useState toggle: it is a
 * disclosure, and the element that means disclosure already handles the
 * keyboard, the screen reader and find-in-page (browsers open a closed
 * <details> to reveal a match). The triangle is ours only because the native
 * marker can't be aligned; the behaviour underneath is the browser's.
 */
export function Fold({
  title,
  hint,
  aside,
  defaultOpen = false,
  children,
}: {
  title: string
  hint?: string
  /** Current answer, shown on the closed row. Folding hides the choices;
   *  without this it would also hide the choice already made, and you'd
   *  have to open all of them again just to read your own settings back. */
  aside?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className="fold" open={defaultOpen}>
      <summary className="fold__summary">
        <span className="fold__tri" aria-hidden="true">
          ▸
        </span>
        <span className="fold__title">{title}</span>
        {aside && <span className="fold__aside">{aside}</span>}
      </summary>
      <div className="fold__body">
        {hint && <p className="muted fold__hint">{hint}</p>}
        {children}
      </div>
    </details>
  )
}
