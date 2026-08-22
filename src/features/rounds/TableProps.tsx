import type { RoundStatus } from '../../lib/rpc'

// Objects on the cloth, cropped by the screen edge so the page reads as a
// detail of a larger table rather than a page with a pattern behind it.
//
// These are PLACEHOLDERS. The real ones are top-down renders, and the three
// rules that make them work are in PRESENTATION.md: one camera angle shared
// by every object, one light source (here: upper left, so every shadow falls
// lower right), and the shadow baked into the file rather than added in CSS.
//
// The table also wears through the evening — laid, then used, then cleared —
// and the marks accumulate rather than reset, so the dinner leaves a trace
// instead of looking re-laid between phases.

type Wear = 'laid' | 'used' | 'cleared'

function wearOf(status: RoundStatus): Wear {
  if (status === 'DRAFT' || status === 'OPEN' || status === 'LOCKED') return 'laid'
  if (status === 'VOTING' || status === 'RESULTS' || status === 'ARCHIVED') return 'cleared'
  return 'used'
}

function Plate({ stacked }: { stacked: boolean }) {
  return (
    <svg className="prop" style={{ top: -54, right: -70, width: 180 }} viewBox="0 0 230 230" aria-hidden="true">
      <circle cx="118" cy="120" r="100" fill="rgba(120,40,30,.2)" />
      {stacked && <circle cx="106" cy="122" r="98" fill="#efe6d6" stroke="#cbb89a" strokeWidth="1.5" />}
      {stacked && <circle cx="109" cy="112" r="96" fill="#f7f0e2" stroke="#d4c1a4" strokeWidth="1.5" />}
      <circle cx="112" cy={stacked ? 102 : 112} r="98" fill="#fffdf7" stroke="#d9c7ac" strokeWidth="1.5" />
      <circle cx="112" cy={stacked ? 102 : 112} r="74" fill="#fff9ee" stroke="#e8dac2" strokeWidth="2" />
      <circle cx="112" cy={stacked ? 102 : 112} r="48" fill="none" stroke="#f0e5d4" strokeWidth="1.5" />
    </svg>
  )
}

// From directly above a glass is the circle of its rim and the disc of the
// wine — never the stem. The level drops as the evening goes on.
function Glass({ level }: { level: number }) {
  return (
    <svg className="prop" style={{ bottom: 96, right: -48, width: 118 }} viewBox="0 0 170 170" aria-hidden="true">
      <circle cx="90" cy="92" r="66" fill="rgba(120,40,30,.18)" />
      <circle cx="84" cy="84" r="66" fill="rgba(255,255,255,.5)" stroke="#d9c7ac" strokeWidth="2" />
      {level > 0 && <circle cx="84" cy="84" r={level} fill="rgba(150,26,38,.55)" />}
      <ellipse cx="66" cy="64" rx="16" ry="9" fill="rgba(255,255,255,.3)" transform="rotate(-30 66 64)" />
    </svg>
  )
}

function Cutlery() {
  return (
    <svg className="prop" style={{ bottom: -62, left: -30, width: 106 }} viewBox="0 0 120 250" aria-hidden="true">
      <rect x="9" y="21" width="106" height="220" rx="3" fill="rgba(120,40,30,.16)" />
      <rect x="4" y="16" width="106" height="220" rx="3" fill="#f4eada" stroke="#dfcdaf" strokeWidth="1.4" />
      <g fill="#fffdf7" stroke="#c6b091" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M20 34 L20 68 C20 78 25 82 29 85 L28 214 C28 223 31 227 33.5 227 C36 227 39 223 39 214 L38 85 C42 82 47 78 47 68 L47 34 Z" />
        <path d="M29 36 v32 M38 36 v32" strokeWidth="1.3" fill="none" />
        <path d="M79 32 C85 48 87 66 87 84 L87 118 L71 118 L71 84 C71 66 73 48 79 32 Z" />
        <rect x="72" y="118" width="14" height="110" rx="7" />
      </g>
    </svg>
  )
}

// Soaked into the cloth rather than sitting on it — under the objects, over
// the checks. Marks accumulate: what appeared during dinner is still there
// at the end, with more beside it.
function Marks({ wear }: { wear: Wear }) {
  if (wear === 'laid') return null
  const heavy = wear === 'cleared'
  return (
    <svg
      className="prop"
      style={{ inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply' }}
      viewBox="0 0 340 700"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <ellipse cx="266" cy="150" rx="30" ry="28" fill="none" stroke="rgba(122,26,48,.36)" strokeWidth="7" />
      <ellipse cx="266" cy="150" rx="26" ry="24" fill="rgba(122,26,48,.11)" />
      <ellipse cx="214" cy="206" rx="9" ry="7" fill="rgba(122,26,48,.24)" transform="rotate(-18 214 206)" />
      {heavy && <ellipse cx="92" cy="300" rx="26" ry="24" fill="none" stroke="rgba(122,26,48,.3)" strokeWidth="6" />}
      {heavy && <ellipse cx="288" cy="430" rx="22" ry="20" fill="none" stroke="rgba(122,26,48,.26)" strokeWidth="6" />}
      {heavy && <ellipse cx="150" cy="560" rx="26" ry="16" fill="rgba(140,90,40,.16)" transform="rotate(-8 150 560)" />}
      <g fill="#c79a5c">
        <ellipse cx="176" cy="392" rx="3.4" ry="2.3" transform="rotate(24 176 392)" />
        <ellipse cx="204" cy="406" rx="2.6" ry="1.9" />
        <ellipse cx="152" cy="416" rx="3.8" ry="2.5" transform="rotate(-30 152 416)" />
        <ellipse cx="126" cy="366" rx="2.8" ry="2" transform="rotate(40 126 366)" />
        {heavy && <ellipse cx="248" cy="486" rx="3.2" ry="2.1" transform="rotate(-12 248 486)" />}
        {heavy && <ellipse cx="196" cy="522" rx="2.4" ry="1.7" />}
        {heavy && <ellipse cx="286" cy="356" rx="2.6" ry="1.8" transform="rotate(15 286 356)" />}
        {heavy && <ellipse cx="72" cy="470" rx="2.4" ry="1.7" />}
      </g>
    </svg>
  )
}

export function TableProps({ status }: { status: RoundStatus }) {
  const wear = wearOf(status)
  return (
    <>
      <Marks wear={wear} />
      <Plate stacked={wear === 'cleared'} />
      <Glass level={wear === 'laid' ? 53 : wear === 'used' ? 38 : 16} />
      <Cutlery />
    </>
  )
}
