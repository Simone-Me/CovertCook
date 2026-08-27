import { useEffect, useId, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string
      remove: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
const PLACEHOLDER_SITE_KEY = 'replace-with-turnstile-site-key'

/**
 * Does this deployment have a captcha at all?
 *
 * Exported because it decides more than whether to draw a widget: with no site
 * key there is nothing to verify, so the join path skips the Edge Function
 * entirely and `join_round` takes no ticket (0063). One condition, read in both
 * places, or the two disagree and joining breaks in a way that points at
 * neither.
 */
export function captchaConfigured(): boolean {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY
  return !!key && key !== PLACEHOLDER_SITE_KEY
}

/**
 * Renders a Cloudflare Turnstile widget and calls onVerify with the token
 * once solved. Until a real VITE_TURNSTILE_SITE_KEY is configured (see
 * .env.example), this calls onVerify with a dev placeholder immediately so
 * local development isn't blocked — remove that fallback once a site key
 * exists, since it must never ship to a real deployment.
 */
export function Turnstile({ onVerify }: { onVerify: (token: string) => void }) {
  const containerId = useId()
  const widgetId = useRef<string | null>(null)
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    // Nothing to draw and nothing to send. It used to hand back a placeholder
    // token that an Edge Function accepted without checking — which was not a
    // bypass so much as an absence of protection with extra steps, and it is
    // gone (0063).
    if (!captchaConfigured()) return

    let cancelled = false

    function render() {
      const el = document.getElementById(containerId)
      if (!el || !window.turnstile || cancelled) return
      widgetId.current = window.turnstile.render(el, { sitekey: siteKey, callback: onVerify })
    }

    if (window.turnstile) {
      render()
    } else {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = render
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, siteKey])

  if (!captchaConfigured()) return null
  return <div id={containerId} />
}
