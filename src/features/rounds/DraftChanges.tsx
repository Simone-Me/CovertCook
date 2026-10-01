import { useTranslation } from 'react-i18next'
import type { RoundRow } from './hooks'
import { HostAction } from './HostAction'
import { ThemesEditor } from './ThemesEditor'
import { DraftSetup } from './DraftSetup'
import { FilRougePanel } from './FilRougePanel'

/**
 * Everything the Executive Chef can still change about the dinner, under one
 * roof: "Changes". Folded, because most visits to the pass are not about this.
 *
 * What is on offer follows the phase. The looks, the door and the guests are
 * settled while the dinner is a draft (0098–0101): once people are in, they
 * have been dealt names and have seen the cloth. The theme stays open until the
 * roulette deals.
 */
export function DraftChanges({ round, locale }: { round: RoundRow; locale: string }) {
  const { t } = useTranslation()
  const draft = round.status === 'DRAFT'

  return (
    <HostAction title={t('rounds.changes.title')} aside={draft ? undefined : t('rounds.changes.theme')}>
      {draft && (
        <>
          <ThemesEditor
            roundId={round.id}
            kind="name"
            nameTheme={round.name_theme}
            tableTheme={round.table_theme}
            locale={locale}
          />
          <ThemesEditor
            roundId={round.id}
            kind="table"
            nameTheme={round.name_theme}
            tableTheme={round.table_theme}
            locale={locale}
          />
        </>
      )}
      <FilRougePanel roundId={round.id} />
      {draft && (
        <DraftSetup
          key={`${round.access}-${round.anonymity}-${round.max_players}-${round.recipes_per_brief}-${round.requires_approval}-${round.guests_allowed}`}
          roundId={round.id}
          initial={{
            access: round.access,
            anonymity: round.anonymity,
            requiresApproval: round.requires_approval,
            seats: round.max_players,
            recipes: round.recipes_per_brief,
            guestsAllowed: round.guests_allowed,
          }}
        />
      )}
    </HostAction>
  )
}
