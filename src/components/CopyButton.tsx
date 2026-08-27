import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Copy something, and say that it happened.
 *
 * The saying is the whole component. A copy button that does not change is
 * indistinguishable from a copy button that failed, so people press it three
 * times and then paste to check — and the clipboard is the one operation in a
 * browser with no visible result of its own.
 *
 * Two seconds, then back to its own label. Long enough to be read, short
 * enough that the button is ready again before somebody wants it.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Denied permission, or an insecure origin — Safari refuses the
      // clipboard outside a user gesture it recognises. Saying nothing is
      // right: the code is printed beside the button and can be selected by
      // hand, so a failure here costs a moment rather than the invitation.
    }
  }

  return (
    <button type="button" className="secondary" onClick={copy} aria-live="polite">
      {copied ? t('actions.copied') : label}
    </button>
  )
}
