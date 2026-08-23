import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * A confirmation that stays on the page.
 *
 * `window.confirm` tears the reader out of the thing they were looking at,
 * strips the message of every bit of formatting, cannot say what will happen
 * in more than one flat sentence, and gives the destructive option a button
 * the same size and weight as the safe one. Worse, it appears detached from
 * the control that raised it, so the reader has to remember what they clicked.
 *
 * This appears exactly where the decision was taken, keeps the surrounding
 * page readable, and gives the consequence room to be a sentence rather than a
 * warning label. The buttons are small on purpose: the weight of the decision
 * is carried by the words, not by the size of the target.
 */
export function InlineConfirm({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children?: ReactNode
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="confirmbox" role="alert">
      <p className="confirmbox__what">{title}</p>
      {children}
      <div className="row">
        <button type="button" className="confirmbox__ok" disabled={busy} onClick={onConfirm}>
          {confirmLabel ?? t('actions.confirm')}
        </button>
        <button type="button" className="confirmbox__cancel" onClick={onCancel}>
          {t('actions.cancel')}
        </button>
      </div>
    </div>
  )
}
