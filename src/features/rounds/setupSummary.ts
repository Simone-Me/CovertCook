import { useTranslation } from 'react-i18next'
import type { RoundSetup } from '../../lib/roundSetup'

/** The dinner a setup describes, in the words the long form uses for the same
 *  answers. The gist, never all fifteen: the form is where the rest lives. */
export function useSetupSummary() {
  const { t } = useTranslation()
  return (setup: RoundSetup) =>
    [
      t(`rounds.anonymity.${setup.anonymity}`),
      t(`rounds.access.${setup.access}`),
      // Only a cap is news: no cap is the default, and saying so is noise.
      setup.seats === null ? null : t('rounds.door.seats', { count: setup.seats }),
      t(`rounds.slotMode.${setup.slotMode}`),
      t(`rounds.voting.${setup.votingMode}`),
      t(`costs.mode.${setup.costMode}`),
      setup.menuVisibility !== 'HIDDEN' ? t(`rounds.sharedMenu.${setup.menuVisibility}`) : null,
      setup.filRougeCategory ? t(`filRouge.category.${setup.filRougeCategory}`) : null,
    ]
      .filter(Boolean)
      .join(' · ')
}
