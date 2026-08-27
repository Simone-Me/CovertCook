/**
 * Does this deployment have a captcha at all?
 *
 * It decides more than whether to draw a widget: with no site key there is
 * nothing to verify, so the join path skips the Edge Function entirely and
 * `join_round` takes no ticket (0063). One condition, read in both places, or
 * the two disagree and joining breaks in a way that points at neither.
 *
 * In its own file rather than beside the widget so that importing the question
 * does not mean importing a component — which is also what stops the fast
 * refresh warning that a module exporting both earns.
 */
const PLACEHOLDER_SITE_KEY = 'replace-with-turnstile-site-key'

export function captchaSiteKey(): string | null {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY
  return key && key !== PLACEHOLDER_SITE_KEY ? key : null
}

export function captchaConfigured(): boolean {
  return captchaSiteKey() !== null
}
