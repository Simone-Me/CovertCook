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
    if (!siteKey || siteKey === PLACEHOLDER_SITE_KEY) {
      onVerify('dev-placeholder-token')
      return
    }

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

  if (!siteKey || siteKey === PLACEHOLDER_SITE_KEY) return null
  return <div id={containerId} />
}
