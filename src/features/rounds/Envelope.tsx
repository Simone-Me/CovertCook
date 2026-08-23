import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

// A drawer, drawn as an envelope. Two ways of opening, both of which the
// visual direction treats as the same gesture (PRESENTATION.md, "Drawer
// behaviour"):
//
//   - `to`     — the heavy ones. Navigates: the envelope lifts off the
//                cloth and the letter inside fills the screen. The route
//                change IS the takeover, not an alternative to it.
//   - `onOpen` — the light ones. Expands in place, one at a time.
//
// `waitingFor` renders it dimmed and unclickable with the reason showing.
// A drawer that will never open in this round is not rendered at all —
// dimmed means "not yet", never "not at all".
export function Envelope({
  icon,
  name,
  meta,
  badge,
  waitingFor,
  to,
  onOpen,
  tilt = 1,
  children,
}: {
  icon: ReactNode
  name: string
  meta?: string
  badge?: ReactNode
  waitingFor?: string
  to?: string
  onOpen?: () => void
  tilt?: 1 | 2 | 3 | 4
  children?: ReactNode
}) {
  const navigate = useNavigate()
  const disabled = !!waitingFor

  return (
    <div>
      <button
        type="button"
        className={`env tilt-${tilt}`}
        disabled={disabled}
        aria-expanded={children ? true : undefined}
        onClick={() => {
          if (disabled) return
          if (to) navigate(to)
          else onOpen?.()
        }}
      >
        <span className="env__ico" aria-hidden="true">
          {icon}
        </span>
        <span className="env__txt">
          <span className="env__name">{name}</span>
          {(waitingFor || meta) && <span className="env__meta">{waitingFor ?? meta}</span>}
        </span>
        {/* A dimmed envelope never carries a badge — it can't be acted on,
            so flagging it for attention would be a lie. */}
        {badge !== undefined && !disabled && <span className="env__pip">{badge}</span>}
      </button>
      {children && <div className="letter" style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}
