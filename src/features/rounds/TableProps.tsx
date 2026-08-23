import type { CSSProperties } from 'react'
import type { RoundStatus } from '../../lib/rpc'

// Objects on the cloth. The page is a detail of a larger table, so pieces run
// off the edges — but they are not banished to the margins: a plate sitting
// where a plate would sit reads as a table, and the paper and envelopes are
// opaque and above them (z-index 2 vs 0), so nothing readable is ever on top
// of one.
//
// Still placeholders, but drawn rather than sketched: radial shading instead
// of flat fills, a rim highlight on every glazed surface, and shadows that
// all fall from one light — upper left, everything casts lower right.
// Getting that consistent is most of what makes a set of objects look like
// they share a table.
//
// THE THING THAT MAKES IT A TABLE AND NOT A PATTERN: the objects move. A
// table nobody has sat at is aligned; halfway through, the plate is askew
// and half empty, the glass has moved and left its ring, the cutlery is no
// longer parallel; at the end the plates are stacked with the cutlery thrown
// on top. You can tell the phase without reading anything, which is the
// whole point (DESIGN.md §3) — the progress bar becomes a confirmation
// rather than the only source.
//
// The three rules the real renders must follow are in DESIGN.md §4: one
// camera angle for every object, one light source, and the shadow baked into
// the file rather than added in CSS (a CSS shadow follows the bounding box,
// not the silhouette, and reads as fake immediately).

type Wear = 'laid' | 'used' | 'cleared'

function wearOf(status: RoundStatus): Wear {
  if (status === 'DRAFT' || status === 'OPEN' || status === 'LOCKED') return 'laid'
  if (status === 'VOTING' || status === 'RESULTS' || status === 'ARCHIVED') return 'cleared'
  return 'used'
}

// Where a given object stands in each of the three states. Kept as one map
// per object so a piece's whole journey across the evening reads in one
// place, instead of being scattered through three branches.
function at(wear: Wear, places: Record<Wear, CSSProperties>): CSSProperties {
  return { ...places[wear], transition: 'none' }
}

// Shared once rather than per-object, so every piece of china is lit the
// same way.
function PropDefs() {
  return (
    <defs>
      <radialGradient id="cc-china" cx="34%" cy="28%" r="78%">
        <stop offset="0%" stopColor="#fffefb" />
        <stop offset="62%" stopColor="#fdf8ef" />
        <stop offset="100%" stopColor="#efe4d2" />
      </radialGradient>
      <radialGradient id="cc-wine" cx="36%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#a8283c" />
        <stop offset="70%" stopColor="#7e1a2e" />
        <stop offset="100%" stopColor="#5e1223" />
      </radialGradient>
      <radialGradient id="cc-shadow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(120,40,30,.3)" />
        <stop offset="70%" stopColor="rgba(120,40,30,.16)" />
        <stop offset="100%" stopColor="rgba(120,40,30,0)" />
      </radialGradient>
      <linearGradient id="cc-steel" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#f2eee6" />
        <stop offset="100%" stopColor="#d9d2c6" />
      </linearGradient>
      <linearGradient id="cc-wood" x1="0%" y1="0%" x2="60%" y2="100%">
        <stop offset="0%" stopColor="#d3a973" />
        <stop offset="55%" stopColor="#c69c64" />
        <stop offset="100%" stopColor="#ad8149" />
      </linearGradient>
    </defs>
  )
}

// What's left on a plate once people have eaten off it: a smear of sauce
// dragged by a fork, a couple of leaves, a tomato nobody wanted.
function Leftovers({ cy }: { cy: number }) {
  return (
    <g opacity="0.9">
      <path
        d={`M ${76} ${cy - 6} q 34 22 74 6`}
        fill="none"
        stroke="rgba(178,120,58,.45)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <ellipse cx="92" cy={cy - 16} rx="19" ry="11" fill="#7fa04d" transform={`rotate(-24 92 ${cy - 16})`} />
      <ellipse cx="126" cy={cy + 4} rx="14" ry="9" fill="#8fae5c" transform={`rotate(32 126 ${cy + 4})`} />
      <circle cx="104" cy={cy + 18} r="7" fill="#c0392b" />
      <circle cx="136" cy={cy - 12} r="5" fill="#b4302a" />
      <ellipse cx="80" cy={cy + 12} rx="6" ry="4" fill="#e0c270" transform={`rotate(20 80 ${cy + 12})`} />
    </g>
  )
}

function Plate({ wear }: { wear: Wear }) {
  const stacked = wear === 'cleared'
  const cy = stacked ? 106 : 116
  return (
    <svg
      className="prop"
      style={at(wear, {
        laid: { top: -46, right: -58, width: 196 },
        // Pushed in and turned: somebody ate off this and shoved it away.
        used: { top: 96, right: -22, width: 196, transform: 'rotate(-7deg)' },
        cleared: { top: 118, right: -30, width: 208, transform: 'rotate(3deg)' },
      })}
      viewBox="0 0 240 240"
      aria-hidden="true"
    >
      <PropDefs />
      <ellipse cx="126" cy="128" rx="104" ry="101" fill="url(#cc-shadow)" />
      {/* A stack shows as the edges of the plates beneath, each one a sliver
          offset up and to the right of the one below. */}
      {stacked && <circle cx="112" cy="124" r="99" fill="#e9dfcd" stroke="#c9b79a" strokeWidth="1.2" />}
      {stacked && <circle cx="114" cy="115" r="98" fill="#f3ebdc" stroke="#cfbda1" strokeWidth="1.2" />}
      <circle cx="116" cy={cy} r="98" fill="url(#cc-china)" stroke="#d6c3a6" strokeWidth="1.3" />
      <circle cx="116" cy={cy} r="74" fill="none" stroke="#e7d9c1" strokeWidth="2.4" />
      <circle cx="116" cy={cy} r="49" fill="none" stroke="#efe4d2" strokeWidth="1.4" />

      {wear === 'used' && <Leftovers cy={cy} />}
      {/* Wiped rather than washed: by the end there is only a stain left. */}
      {stacked && (
        <g opacity="0.5">
          <path d="M 82 96 q 32 17 70 4" fill="none" stroke="rgba(180,140,80,.6)" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="98" cy="118" rx="5" ry="3.5" fill="#b4302a" />
        </g>
      )}

      {/* Glaze catching the light, cut to an arc rather than a full ring — a
          rim only shines where it faces the window. */}
      <path
        d={`M ${116 - 88} ${cy - 30} A 93 93 0 0 1 ${116 - 26} ${cy - 89}`}
        fill="none"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

// From directly above, a glass is the ring of its rim and the disc of what's
// in it — never the stem. The level drops through the evening, and so does
// the glass: it wanders away from where it was set down.
function Glass({ wear }: { wear: Wear }) {
  const level = wear === 'laid' ? 55 : wear === 'used' ? 39 : 15
  return (
    <svg
      className="prop"
      style={at(wear, {
        laid: { top: 128, right: -40, width: 124 },
        used: { top: 300, right: 8, width: 124 },
        cleared: { top: 386, right: -34, width: 124 },
      })}
      viewBox="0 0 180 180"
      aria-hidden="true"
    >
      <PropDefs />
      <ellipse cx="98" cy="98" r="70" fill="url(#cc-shadow)" />
      <circle cx="88" cy="88" r="68" fill="rgba(255,255,255,.42)" stroke="#cdbba0" strokeWidth="1.2" />
      {/* The bowl wall seen end-on: a bright ring just inside the rim. */}
      <circle cx="88" cy="88" r="62" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="4" />
      {level > 0 && <circle cx="88" cy="88" r={level} fill="url(#cc-wine)" />}
      {level > 0 && (
        <ellipse
          cx={88 - level * 0.34}
          cy={88 - level * 0.36}
          rx={level * 0.3}
          ry={level * 0.17}
          fill="rgba(255,255,255,.22)"
          transform={`rotate(-32 ${88 - level * 0.34} ${88 - level * 0.36})`}
        />
      )}
      <path d="M 26 70 A 66 66 0 0 1 70 26" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// A small bowl, on the left where the plate isn't. Empty by the end.
function Bowl({ wear }: { wear: Wear }) {
  return (
    <svg
      className="prop"
      style={at(wear, {
        laid: { top: 232, left: -66, width: 136 },
        used: { top: 258, left: -46, width: 136, transform: 'rotate(9deg)' },
        cleared: { top: 246, left: -72, width: 136, transform: 'rotate(-5deg)' },
      })}
      viewBox="0 0 180 180"
      aria-hidden="true"
    >
      <PropDefs />
      <ellipse cx="98" cy="98" r="78" fill="url(#cc-shadow)" />
      <circle cx="88" cy="88" r="76" fill="url(#cc-china)" stroke="#d6c3a6" strokeWidth="1.3" />
      <circle cx="88" cy="88" r="57" fill="#f4e9d5" stroke="#e3d3b7" strokeWidth="1.5" />
      {wear === 'laid' && <circle cx="88" cy="88" r="44" fill="#efe0c4" />}
      {wear === 'used' && (
        <g>
          <ellipse cx="80" cy="82" rx="17" ry="12" fill="#e8d3a4" transform="rotate(-14 80 82)" />
          <ellipse cx="102" cy="98" rx="12" ry="8" fill="#dcc38c" transform="rotate(22 102 98)" />
        </g>
      )}
      <path d="M 30 72 A 62 62 0 0 1 72 30" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// The napkin. Folded square while the table is laid, rucked and shoved aside
// once people have used it.
function Napkin({ wear }: { wear: Wear }) {
  const folded = wear === 'laid'
  return (
    <svg
      className="prop"
      style={at(wear, {
        laid: { bottom: -40, left: -20, width: 112 },
        used: { bottom: -28, left: -34, width: 118, transform: 'rotate(-13deg)' },
        cleared: { bottom: -44, left: 26, width: 118, transform: 'rotate(21deg)' },
      })}
      viewBox="0 0 130 260"
      aria-hidden="true"
    >
      <rect x="12" y="26" width="106" height="218" rx="3" fill="rgba(120,40,30,.15)" />
      {folded ? (
        <>
          <rect x="6" y="20" width="106" height="218" rx="3" fill="#f2e7d5" stroke="#dcc9a9" strokeWidth="1.2" />
          <path d="M59 24 v210" stroke="#e6d7bd" strokeWidth="1.4" fill="none" />
        </>
      ) : (
        // Cloth that has been picked up and dropped: the outline stops being
        // a rectangle, and the folds no longer line up with anything.
        <>
          <path
            d="M14 34 C40 20 88 26 110 40 C118 78 104 120 112 168
               C116 206 100 232 74 238 C46 244 20 226 16 194
               C12 150 22 96 14 34 Z"
            fill="#f2e7d5"
            stroke="#dcc9a9"
            strokeWidth="1.2"
          />
          <path d="M36 52 C52 96 44 150 58 214" stroke="#e6d7bd" strokeWidth="1.6" fill="none" />
          <path d="M84 48 C74 92 92 138 82 200" stroke="#e6d7bd" strokeWidth="1.4" fill="none" />
        </>
      )}
    </svg>
  )
}

// Fork and knife are separate objects, because that is the only way they can
// be scattered. Laid out they are parallel; by the end they have been
// dropped wherever the hand let go.
function Fork({ wear }: { wear: Wear }) {
  return (
    <svg
      className="prop"
      style={at(wear, {
        laid: { bottom: 24, left: 10, width: 34 },
        used: { bottom: 92, left: 46, width: 34, transform: 'rotate(-38deg)' },
        cleared: { top: 150, right: 46, width: 34, transform: 'rotate(64deg)' },
      })}
      viewBox="0 0 60 240"
      aria-hidden="true"
    >
      <PropDefs />
      <g fill="url(#cc-steel)" stroke="#bfae91" strokeWidth="1.2" strokeLinejoin="round">
        <path
          d="M14 14 L14 46 C14 56 19 61 23 64 L22 192
             C22 201 25 205 27.5 205 C30 205 33 201 33 192 L32 64
             C37 61 42 56 42 46 L42 14 Z"
        />
        <path d="M21.5 16 v30 M28 16 v30 M35 16 v30" strokeWidth="1" fill="none" stroke="#cbbb9f" />
      </g>
      <path d="M25 72 L26 186" stroke="rgba(255,255,255,.8)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Knife({ wear }: { wear: Wear }) {
  return (
    <svg
      className="prop"
      style={at(wear, {
        laid: { bottom: 24, left: 54, width: 34 },
        used: { bottom: 168, left: -6, width: 34, transform: 'rotate(24deg)' },
        cleared: { top: 176, right: 76, width: 34, transform: 'rotate(48deg)' },
      })}
      viewBox="0 0 60 240"
      aria-hidden="true"
    >
      <PropDefs />
      <g fill="url(#cc-steel)" stroke="#bfae91" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M30 10 C36 28 38 46 38 64 L38 96 L20 96 L20 64 C20 46 22 28 30 10 Z" />
        <rect x="21" y="96" width="17" height="108" rx="8.5" />
        <path d="M25 20 C29 36 30 50 30 64 L30 94" strokeWidth="1" fill="none" stroke="#cbbb9f" />
      </g>
      <path d="M26 20 L26 92" stroke="rgba(255,255,255,.8)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// The bread board arrives with the food and stays out. It is the source of
// most of the crumbs on the cloth, so it appears with them.
function BreadBoard({ wear }: { wear: Wear }) {
  if (wear === 'laid') return null
  return (
    <svg
      className="prop"
      style={at(wear, {
        laid: {},
        used: { top: 470, left: -30, width: 172, transform: 'rotate(5deg)' },
        cleared: { top: 508, left: -48, width: 172, transform: 'rotate(-9deg)' },
      })}
      viewBox="0 0 200 130"
      aria-hidden="true"
    >
      <PropDefs />
      <rect x="10" y="16" width="184" height="102" rx="9" fill="rgba(120,40,30,.2)" />
      <rect x="4" y="8" width="184" height="102" rx="9" fill="url(#cc-wood)" stroke="#a67d48" strokeWidth="1.4" />
      {/* Grain, and the knife scores that say it has been used before. */}
      <path d="M18 30 h156 M18 54 h156 M18 78 h156" stroke="rgba(120,86,44,.28)" strokeWidth="1.2" fill="none" />
      {wear === 'used' && (
        <>
          <ellipse cx="66" cy="50" rx="33" ry="24" fill="#e3bf83" stroke="#c2954f" strokeWidth="2" />
          <ellipse cx="66" cy="50" rx="24" ry="16" fill="#f6e5c2" />
          <ellipse cx="128" cy="70" rx="29" ry="21" fill="#e3bf83" stroke="#c2954f" strokeWidth="2" transform="rotate(14 128 70)" />
          <ellipse cx="128" cy="70" rx="20" ry="13" fill="#f6e5c2" transform="rotate(14 128 70)" />
        </>
      )}
      {wear === 'cleared' && (
        <ellipse cx="104" cy="60" rx="16" ry="11" fill="#e3bf83" stroke="#c2954f" strokeWidth="1.6" transform="rotate(-8 104 60)" />
      )}
      <path d="M12 20 h168" stroke="rgba(255,255,255,.45)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Soaked into the cloth rather than sitting on it — under the objects, over
// the checks, in multiply so the check pattern shows through the stain the
// way it would through wine. Marks accumulate: what appeared during dinner is
// still there at the end, with more beside it.
//
// The rings are placed where a glass HAS stood, not where it stands now:
// the ring at the top is the one the glass left before it wandered off.
function Marks({ wear }: { wear: Wear }) {
  if (wear === 'laid') return null
  const heavy = wear === 'cleared'
  return (
    <svg
      className="prop"
      style={{ inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply' }}
      viewBox="0 0 340 760"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* A ring is darker where the base sat longest, so the stroke is uneven
          rather than a clean circle. */}
      <ellipse cx="278" cy="176" rx="31" ry="29" fill="none" stroke="rgba(122,26,48,.34)" strokeWidth="7" />
      <path d="M251 185 A31 29 0 0 0 301 196" fill="none" stroke="rgba(122,26,48,.2)" strokeWidth="5" />
      <ellipse cx="278" cy="176" rx="27" ry="25" fill="rgba(122,26,48,.09)" />

      {/* Splashes: one big drop and the smaller ones thrown ahead of it. */}
      <ellipse cx="222" cy="238" rx="10" ry="7.5" fill="rgba(122,26,48,.26)" transform="rotate(-18 222 238)" />
      <ellipse cx="204" cy="252" rx="4.5" ry="3.4" fill="rgba(122,26,48,.22)" />
      <ellipse cx="192" cy="262" rx="2.6" ry="2" fill="rgba(122,26,48,.18)" />

      {/* Grease, not wine — a plate was dragged across here. */}
      <ellipse cx="128" cy="352" rx="30" ry="19" fill="rgba(150,110,50,.11)" transform="rotate(-14 128 352)" />

      {heavy && <ellipse cx="96" cy="318" rx="27" ry="25" fill="none" stroke="rgba(122,26,48,.28)" strokeWidth="6" />}
      {heavy && <ellipse cx="292" cy="470" rx="23" ry="21" fill="none" stroke="rgba(122,26,48,.24)" strokeWidth="6" />}
      {heavy && <ellipse cx="150" cy="612" rx="27" ry="17" fill="rgba(140,90,40,.15)" transform="rotate(-8 150 612)" />}
      {heavy && <ellipse cx="248" cy="666" rx="14" ry="10" fill="rgba(122,26,48,.2)" transform="rotate(22 248 666)" />}

      {/* Crumbs. Two tones, because bread crumb and crust crumb are not the
          same colour, and a single tone reads as noise. */}
      <g fill="#c79a5c">
        <ellipse cx="176" cy="412" rx="3.4" ry="2.3" transform="rotate(24 176 412)" />
        <ellipse cx="204" cy="428" rx="2.6" ry="1.9" />
        <ellipse cx="152" cy="436" rx="3.8" ry="2.5" transform="rotate(-30 152 436)" />
        <ellipse cx="126" cy="388" rx="2.8" ry="2" transform="rotate(40 126 388)" />
        <ellipse cx="216" cy="398" rx="2.2" ry="1.6" />
        <ellipse cx="190" cy="452" rx="3" ry="2.1" transform="rotate(-16 190 452)" />
        <ellipse cx="238" cy="440" rx="2.4" ry="1.7" transform="rotate(52 238 440)" />
        {heavy && <ellipse cx="248" cy="536" rx="3.2" ry="2.1" transform="rotate(-12 248 536)" />}
        {heavy && <ellipse cx="196" cy="572" rx="2.4" ry="1.7" />}
        {heavy && <ellipse cx="286" cy="396" rx="2.6" ry="1.8" transform="rotate(15 286 396)" />}
        {heavy && <ellipse cx="72" cy="520" rx="2.4" ry="1.7" />}
        {heavy && <ellipse cx="118" cy="646" rx="3.1" ry="2.2" transform="rotate(-34 118 646)" />}
        {heavy && <ellipse cx="266" cy="604" rx="2.3" ry="1.6" />}
      </g>
      <g fill="#a87b47">
        <ellipse cx="168" cy="422" rx="1.8" ry="1.3" />
        <ellipse cx="200" cy="440" rx="1.6" ry="1.2" />
        <ellipse cx="146" cy="404" rx="1.5" ry="1.1" />
        <ellipse cx="226" cy="418" rx="1.7" ry="1.2" />
        {heavy && <ellipse cx="210" cy="556" rx="1.6" ry="1.2" />}
        {heavy && <ellipse cx="92" cy="588" rx="1.5" ry="1.1" />}
      </g>
    </svg>
  )
}

export function TableProps({ status }: { status: RoundStatus }) {
  const wear = wearOf(status)
  return (
    <>
      <Marks wear={wear} />
      <Plate wear={wear} />
      <Glass wear={wear} />
      <Bowl wear={wear} />
      <BreadBoard wear={wear} />
      <Napkin wear={wear} />
      <Fork wear={wear} />
      <Knife wear={wear} />
    </>
  )
}
