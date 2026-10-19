/**
 * The app's one arrow, the one that slides out of the logo in the header.
 *
 * It used to be typed straight into each label, and a glyph typed into text
 * takes the shape of whatever font that text happens to be in — so the same ←
 * came out as three different arrows across the app. Drawn here it always has
 * the header's shape, and a label carries words only.
 */
export function Arrow({ dir = 'forward', className = '' }: { dir?: 'back' | 'forward'; className?: string }) {
  return (
    <span className={`arrow${className ? ` ${className}` : ''}`} aria-hidden="true">
      {dir === 'back' ? '←' : '→'}
    </span>
  )
}
