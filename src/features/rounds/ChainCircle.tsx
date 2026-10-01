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
  guests,
}: {
  cycle: ChainLink[]
  youId?: string
  /** Print the real names instead of the pseudonyms. True on a dinner where
   *  this reader is entitled to them — OPEN for everybody, SPY for the host
   *  (0073) — where a ring of code names would be a puzzle the reader has
   *  already been given the answer to. */
  realNames?: boolean
  /** People at the table who are not in the ring: same dots, outside it. */
  guests?: { id: string; secret: string; real: string | null }[]
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

  // Where the guests go: the four diagonals (NE, SE, SW, NW), outside the
  // ring. A diagonal is free when none of the ring's own people is within 30°
  // of it; the rest scatter like stars a little further out. The ring itself
  // keeps its size — the box grows only by a margin.
  const memberAngles = Array.from({ length: n }, (_, i) => angle(i))
  const nearest = (a: number) =>
    Math.min(...memberAngles.map((m) => Math.abs(Math.atan2(Math.sin(a - m), Math.cos(a - m)))))
  const diagonals = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]
  const free = diagonals.filter((a) => nearest(a) > Math.PI / 6)
  const guestR = r + 52
  const guestSpots = (guests ?? []).map((g, i) => {
    let x: number
    let y: number
    if (i < free.length) {
      x = c + guestR * Math.cos(free[i])
      y = c + guestR * Math.sin(free[i])
    } else {
      // Stars: the golden angle spreads them without a pattern.
      const k = i - free.length
      const a = -Math.PI / 2 + 0.6 + k * 2.399963
      const rr = guestR + 12 + (k % 3) * 14
      x = c + rr * Math.cos(a)
      y = c + rr * Math.sin(a)
    }
    return { ...g, x, y, side: x < c ? -1 : 1 }
  })

  return (
    <svg
      className="chainring"
      // Room outside the ring for two-line labels on every side.
      viewBox={guests?.length ? `-40 -16 ${size + 80} ${size + 32}` : `-28 -10 ${size + 56} ${size + 20}`}
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
              {/* Once names are open, the code name stays on top: it is the
                  name everybody wrote to all evening, and the real one under
                  it is the answer. Without it the ring is a list of friends
                  that says nothing about who "Avocado" was. */}
              {realNames && link.sender_display_name ? (
                <>
                  <tspan x={lx} dy="-0.6em" className="chainring__secret">
                    {link.sender_secret_name}
                  </tspan>
                  <tspan x={lx} dy="1.25em">
                    {link.sender_display_name}
                  </tspan>
                </>
              ) : (
                link.sender_secret_name
              )}
            </text>
          </g>
        )
      })}
      {/* Guests: outside the ring, unconnected — present, and not part of the
          exchange. Same dot, same type as everybody else. They take the free
          compass points first (N, NE, E…) and, when those are taken by the
          ring's own labels, scatter like stars further out. */}
      {guestSpots.map((g) => (
        <g key={g.id}>
          <circle cx={g.x} cy={g.y} r={nodeR} fill="var(--paper-solid)" stroke="var(--accent)" strokeWidth="1.6" />
          <text
            x={g.x + g.side * 12}
            y={g.y}
            textAnchor={g.side < 0 ? 'end' : 'start'}
            dominantBaseline="middle"
            className="chainring__name"
          >
            {g.real ? (
              <>
                <tspan x={g.x + g.side * 12} dy="-0.6em" className="chainring__secret">
                  {g.secret}
                </tspan>
                <tspan x={g.x + g.side * 12} dy="1.25em">
                  {g.real}
                </tspan>
              </>
            ) : (
              g.secret
            )}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** A chef in a list of the chain: the code name, and the real one beside it
 *  once the reader is entitled to it. */
export function ChainName({ secret, real }: { secret: string; real: string | null }) {
  return (
    <span className="badge chainname">
      <span className="chainname__secret">{secret}</span>
      {real && <strong>{real}</strong>}
    </span>
  )
}
