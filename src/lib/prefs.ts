// Two per-device display preferences. localStorage and not a profile column:
// they depend on the screen in your hand, not on who you are, and a phone and
// a laptop should be able to disagree. Storage can be refused (private mode),
// so every read has a default and every write is allowed to fail.

/** Nine notches, 0 to 8. The middle one (4) is the size the app was drawn at. */
export const TEXT_STEPS = 9
export const DEFAULT_TEXT_STEP = 4
export type TextSizeName = 'small' | 'medium' | 'large'

const STEP_KEY = 'covertcook.textStep'
const COUNTDOWN_KEY = 'covertcook.hideCountdown'

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

/** 0.8 … 1.2 in steps of 0.05. Everything is sized in px, so the whole page is
 *  zoomed rather than the root font size changed — the only scale that reaches
 *  every rule. */
export function zoomForStep(step: number): number {
  return Math.round((0.8 + step * 0.05) * 100) / 100
}

/** Which of the three words the notch is nearest to. */
export function sizeName(step: number): TextSizeName {
  return step < 3 ? 'small' : step > 5 ? 'large' : 'medium'
}

export function getTextStep(): number {
  const n = Number(read(STEP_KEY))
  return Number.isInteger(n) && n >= 0 && n < TEXT_STEPS ? n : DEFAULT_TEXT_STEP
}

export function applyTextStep(step: number = getTextStep()) {
  document.documentElement.style.setProperty('zoom', String(zoomForStep(step)))
}

export function setTextStep(step: number) {
  write(STEP_KEY, String(step))
  applyTextStep(step)
}

export function countdownHidden(): boolean {
  return read(COUNTDOWN_KEY) === '1'
}

export function setCountdownHidden(hidden: boolean) {
  write(COUNTDOWN_KEY, hidden ? '1' : '0')
}
