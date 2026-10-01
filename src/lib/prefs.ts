// Two per-device display preferences. localStorage and not a profile column:
// they depend on the screen in your hand, not on who you are, and a phone and
// a laptop should be able to disagree. Storage can be refused (private mode),
// so every read has a default and every write is allowed to fail.
export type TextSize = 'small' | 'medium' | 'large'

const SIZE_KEY = 'covertcook.textSize'
const COUNTDOWN_KEY = 'covertcook.hideCountdown'
// Everything is sized in px, so the whole page is zoomed rather than the root
// font size changed — the only scale that reaches every rule.
const ZOOM: Record<TextSize, string> = { small: '0.9', medium: '1', large: '1.15' }

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The preference simply lasts until the page is closed.
  }
}

export function getTextSize(): TextSize {
  const v = read(SIZE_KEY)
  return v === 'small' || v === 'large' ? v : 'medium'
}

export function applyTextSize(size: TextSize = getTextSize()) {
  document.documentElement.style.setProperty('zoom', ZOOM[size])
}

export function setTextSize(size: TextSize) {
  write(SIZE_KEY, size)
  applyTextSize(size)
}

export function countdownHidden(): boolean {
  return read(COUNTDOWN_KEY) === '1'
}

export function setCountdownHidden(hidden: boolean) {
  write(COUNTDOWN_KEY, hidden ? '1' : '0')
}
