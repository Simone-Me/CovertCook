import { useState, type ReactNode } from 'react'

/**
 * A question mark in the top-right corner of a letter, and the explanation it
 * opens. The text earns one reading and then only gets in the way, so it is
 * behind the mark rather than printed on the page.
 *
 * The corner is the nearest positioned ancestor — `.letter` and `.pass` both
 * are — so the mark sits on the paper itself.
 */
export function InfoCorner({
  label,
  children,
  onOpenChange,
}: {
  label: string
  children: ReactNode
  /** Told when the explanation opens or closes, for a caller that shows more while it is open. */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="infocorner__btn"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => {
          setOpen(!open)
          onOpenChange?.(!open)
        }}
      >
        ?
      </button>
      {open && <div className="infocorner__text stack">{children}</div>}
    </>
  )
}
