import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * A message that has to be seen, over the page, with one OK.
 *
 * For the few refusals a line of red text is too easy to miss — being told to
 * stop sending messages is one: the line sits under a fridge somebody is
 * looking at, not where they are pressing. Built on <dialog>, which already
 * traps focus, closes on Escape and dims the page.
 */
export function Popup({ open, title, children, onClose }: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="popup" onClose={onClose} aria-labelledby="popup-title">
      <h2 id="popup-title" className="popup__title">{title}</h2>
      <div className="popup__body">{children}</div>
      <button type="button" onClick={onClose} autoFocus>
        {t('actions.ok')}
      </button>
    </dialog>
  )
}
