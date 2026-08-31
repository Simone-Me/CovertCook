import type { ChainLink } from '../../lib/rpc'

/**
 * The chain, drawn as the ring it actually is.
 *
 * A list of "A → B" rows says who cooks for whom but never says that the
 * whole thing closes: the host had to read to the bottom and take the words
 * "loops back to A" on trust. A circle says it in one glance — and it makes
 * the two things that can go wrong visible instead of deduced. A member who
 * has fallen out of the ring isn't on it, and a chain that a manual swap has
 * split into two rings is two rings.
 *
 * Members sit in cycle order, so every arrow is between neighbours and the
 * flow reads round the ring rather than crossing it. That ordering is what a
 * two-column grid would be approximating; going straight to the circle
 * removes the approximation.
 */
export function ChainCircle({
  cycle,
  youId,
  realNames = false,
}: {
  cycle: ChainLink[]
  youId?: string
  /** Print the real names instead of the pseudonyms. True on a dinner where
   *  this reader is entitled to them — OPEN for everybody, SPY for the host
   *  (0073) — where a ring of code names would be a puzzle the reader has
   *  already been given the answer to. */
  realNames?: boolean
}) {
  const nameOf = (link: ChainLink, end: 'sender' | 'cook') =>
    (realNames
      ? end === 'sender'
        ? link.sender_display_name
        : link.cook_display_name
      : null) ?? (end === 'sender' ? link.sender_secret_name : link.cook_secret_name)

  const n = cycle.length
  if (n === 0) return null

  const size = 320
  const c = size / 2
  // The ring itself, then room outside it for the names. The labels are what
  // set the box: a name is much wider than the dot it belongs to.
  const r = n <= 2 ? 74 : 96
  const nodeR = 7
  const labelR = r + 20

  // Node i is the sender of link i, so the arrow from i to i+1 is exactly
  // "i cooks for i+1" — the cycle order does the work.
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n
  const at = (i: number, radius: number) => [c + radius * Math.cos(angle(i)), c + radius * Math.sin(angle(i))]

  // Pull each arc's ends back off the dots so the line starts and stops in
  // clear air — an arrow touching its node reads as a smudge.
  const pad = Math.min(0.34, (Math.PI * 2) / n / 3.2)

  return (
    <svg
      className="chainring"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={cycle.map((l) => `${nameOf(l, 'sender')} → ${nameOf(l, 'cook')}`).join('; ')}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" />

      {cycle.map((link, i) => {
        const a1 = angle(i) + pad
        const a2 = angle((i + 1) % n) - pad
        const x1 = c + r * Math.cos(a1)
        const y1 = c + r * Math.sin(a1)
        const x2 = c + r * Math.cos(a2)
        const y2 = c + r * Math.sin(a2)

        // Halfway along, pointing the way the food goes. With only two people
        // the two arcs are the two halves of the ring, which is still the
        // truth: they cook for each other.
        const am = (a1 + a2) / 2 + (a2 < a1 ? Math.PI : 0)
        const mx = c + r * Math.cos(am)
        const my = c + r * Math.sin(am)
        const tan = (am + Math.PI / 2) * (180 / Math.PI)

        return (
          <g key={link.sender_member_id}>
            <path
              d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.6"
              opacity="0.75"
            />
            <path
              d="M -4 -3.4 L 4 0 L -4 3.4 Z"
              fill="var(--accent)"
              transform={`translate(${mx} ${my}) rotate(${tan})`}
            />
          </g>
        )
      })}

      {cycle.map((link, i) => {
        const [x, y] = at(i, r)
        const [lx, ly] = at(i, labelR)
        const isYou = !!youId && link.sender_member_id === youId
        // On the left half the text runs back towards the ring, on the right
        // it runs away from it — otherwise half the names sit on top of it.
        const anchor = Math.abs(lx - c) < 12 ? 'middle' : lx < c ? 'end' : 'start'
        return (
          <g key={link.sender_member_id}>
            <circle
              cx={x}
              cy={y}
              r={nodeR}
              fill={isYou ? 'var(--accent)' : 'var(--paper-solid)'}
              stroke="var(--accent)"
              strokeWidth="1.6"
            />
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              className={isYou ? 'chainring__name is-you' : 'chainring__name'}
            >
              {nameOf(link, 'sender')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
