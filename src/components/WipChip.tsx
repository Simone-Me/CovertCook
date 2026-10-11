import { useTranslation } from 'react-i18next'

/** "In development": the one mark for anything shown before it is finished —
 *  a page, a preset, a tablecloth being redrawn. Same words, same dashed
 *  outline everywhere, so it reads as one promise rather than many. */
export function WipChip() {
  const { t } = useTranslation()
  return <span className="wip-chip">{t('wip')}</span>
}
