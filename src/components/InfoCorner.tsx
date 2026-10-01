import { useState, type ReactNode } from 'react'

/**
 * A question mark in the top-right corner of a letter, and the explanation it
 * opens. The text earns one reading and then only gets in the way, so it is
 * behind the mark rather than printed on the page.
 *
 * The corner is the nearest positioned ancestor — `.letter` and `.pass` both
 * are — so the mark sits on the paper itself.
 */
export function InfoCorner({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="infocorner__btn"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && <div className="infocorner__text stack">{children}</div>}
    </>
  )
}
