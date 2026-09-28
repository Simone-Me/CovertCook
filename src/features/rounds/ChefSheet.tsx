import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

/**
 * The chef peeking over the counter, and whatever he is asking.
 *
 * A sheet that rises from the foot of the screen with a thick red top edge —
 * the counter — and the chef from the app's mark gripping it with both hands.
 * Everything inside is his line and the answers to it. `step` changes with
 * every question so the chef hops once when a new one arrives: the one piece
 * of movement on the screen, and it is gone under reduced motion.
 *
 * `inline` draws it in the page instead of over it, for the guided tour, where
 * the tour's own bubble already owns the foot of the screen.
 */
export function ChefSheet({
  step,
  inline = false,
  onBack,
  onClose,
  children,
}: {
  step: string
  inline?: boolean
  onBack?: () => void
  onClose?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const sheet = (
    <div className={inline ? 'chefsheet chefsheet--inline' : 'chefsheet'}>
      {!inline && <div className="chefsheet__backdrop" aria-hidden="true" />}
      <div className="chefsheet__paper" role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true}>
        <img key={step} className="chefsheet__chef" src="/chef_peek.webp" alt="" width={150} height={167} />
        <div className="chefsheet__bar">
          {onBack ? (
            <button type="button" className="chefsheet__nav" onClick={onBack}>
              ← {t('actions.back')}
            </button>
          ) : (
            <span />
          )}
          {onClose && (
            <button type="button" className="chefsheet__nav" onClick={onClose} aria-label={t('actions.close')}>
              ✕
            </button>
          )}
        </div>
        <div className="chefsheet__body stack">{children}</div>
      </div>
    </div>
  )
  // Over the page, not inside it: a paper with a shadow or a transform would
  // otherwise become the box a fixed sheet is positioned in.
  return inline ? sheet : createPortal(sheet, document.body)
}
