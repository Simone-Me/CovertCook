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
  chefs: 'chef',
  myRecipe: 'recipe',
  received: 'cooking',
  messages: 'chat',
  fridge: 'mini_fridge',
  chefWrote: 'message_alert',
  allergies: 'allergy',
  where: 'map',
  hands: 'raise-hand',
  ballot: 'ballot',
  pass: 'kitchen',
  chain: 'diagram',
  winner: 'chef_winner_result',
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 26 }: { name: IconName; size?: number }) {
  return (
    <img
      className="icon"
      src={`/${ICONS[name]}.webp`}
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
