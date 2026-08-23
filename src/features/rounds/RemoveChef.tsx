import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RemovalMode } from '../../lib/rpc'

// Removing someone used to be a full-width button beside every name, which
// gave the rarest action in the roster the same weight as the person it sat
// next to — and then a browser confirm() on top.
//
// Now it's a small mark you have to hit deliberately, and the choice it
// opens IS the confirmation. Two taps either way, one fewer modal, and the
// destructive option stops shouting from a list you mostly read.
export function RemoveChef({
  assigned,
  onRemove,
}: {
  assigned: boolean
  onRemove: (mode: RemovalMode) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        className="chef-remove"
        title={t('rounds.remove')}
        aria-label={t('rounds.remove')}
        onClick={() => setOpen(true)}
      >
        🍌
      </button>
    )
  }

  // Before a chain exists the two modes are indistinguishable, so offering
  // both would be a choice without a difference.
  if (!assigned) {
    return (
      <div className="row">
        <button type="button" className="secondary chef-remove-choice" onClick={() => onRemove('COLLAPSE')}>
          {t('rounds.remove')}
        </button>
        <button type="button" className="chef-remove" aria-label={t('actions.cancel')} onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
    )
  }

  // Once the roulette has run there IS a chain, and removing a link from it
  // is a decision about the chain rather than about the roster. Shown as a
  // chain, because "collapse" and "leave" mean nothing until you can see
  // what each one does to the people either side.
  return (
    <div className="chain-choice stack">
      <p className="muted" style={{ margin: 0 }}>{t('rounds.chainChoice.intro')}</p>

      <button type="button" className="secondary chain-option" onClick={() => onRemove('COLLAPSE')}>
        <strong>{t('rounds.removeCollapse')}</strong>
        <code className="chain-figure">A → B → D → E</code>
        <span className="muted">{t('rounds.chainChoice.collapse')}</span>
      </button>

      <button type="button" className="secondary chain-option" onClick={() => onRemove('LEAVE')}>
        <strong>{t('rounds.removeLeave')}</strong>
        <code className="chain-figure">A → B → ✕ &nbsp; D → E</code>
        <span className="muted">{t('rounds.chainChoice.leave')}</span>
      </button>

      <button type="button" className="secondary chef-remove-choice" onClick={() => setOpen(false)}>
        {t('actions.cancel')}
      </button>
    </div>
  )
}
