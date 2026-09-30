// The app's icons, in one place so a drawer and the mark on its envelope can
// never drift apart.
//
// They are decorative in every position they are used: each one sits beside a
// label that already says the same thing, so they carry alt="" and are hidden
// from screen readers. An icon that repeats its own caption out loud is noise.
//
// Shipped as 96px WebP — 3× a 32px icon, which is every phone worth designing
// for. The 512px masters are in assets-src/icons/, out of the build, because
// everything in public/ is precached by the service worker (DESIGN.md §4).
const ICONS = {
  chefs: 'chefs',
  myRecipe: 'my-recipe',
  received: 'received-dish',
  messages: 'chat',
  fridge: 'fridge',
  chefWrote: 'chef-wrote',
  allergies: 'allergies',
  where: 'where',
  hands: 'hands',
  ballot: 'ballot',
  pass: 'pass',
  chain: 'chain',
  winner: 'winner',
  help: 'help',
  // The jar the table drops its coins into. The costs drawer wore the map pin
  // for a while, borrowed from the info drawer beside it — two envelopes with
  // the same mark, one of them about money.
  costs: 'costs',
  menu: 'menu',
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 26 }: { name: IconName; size?: number }) {
  return (
    <img
      className="icon"
      src={`/icons/${ICONS[name]}.webp`}
      alt=""
      aria-hidden="true"
      // Inline, not just attributes: a stylesheet rule that stretched these to
      // fill their container made an icon explode to full width anywhere it
      // was not inside a fixed-size box. The size passed here is the size it
      // is, everywhere, and nothing overrides it.
      style={{ width: size, height: size }}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  )
}
