import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BackToTable } from '../../components/BackToTable'
import { Fold } from '../../components/Fold'
import { ChatThread } from './ChatThread'
import { FridgeBoard } from './FridgeBoard'
import { getMyAssignment, getMyBrief } from '../../lib/rpc'

// Two different things, and now two folds rather than one long scroll.
//
// The Fridge is public and glanceable: the whole table, canned cheerful
// phrases, nobody attributable. Your Chef is the opposite — two private
// conversations with exactly two people, and it is where a question actually
// gets answered. Stacking them open meant the private threads were always
// below the fold, at the bottom of a board that grows all evening.
//
// Still no tabs: on a phone a tab hides half the screen behind a control
// people don't notice. A triangle says there is more under it.
export function BoardPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()

  // The two threads: one with the chef you write for, one with the chef who
  // writes for you. Both exist only once the roulette has run.
  const { data: assignment } = useQuery({
    queryKey: ['rounds', roundId, 'my-assignment'],
    enabled: !!roundId,
    queryFn: () => getMyAssignment(roundId as string),
  })

  const { data: myBrief } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief'],
    enabled: !!roundId,
    queryFn: () => getMyBrief(roundId as string).catch(() => null),
  })

  if (!roundId) return null

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('board.pageTitle')}</h1>

      <Fold title={t('board.fridge')} hint={t('board.help')} defaultOpen>
        <FridgeBoard roundId={roundId} />
      </Fold>

      <Fold title={t('board.yourChef')} hint={t('board.yourChefHelp')}>
        {assignment && (
          <>
            <h3>{t('board.toYourCook')}</h3>
            <ChatThread pairingId={assignment.pairing_id} />
          </>
        )}

        {myBrief && (
          <>
            <h3>{t('board.toYourSender')}</h3>
            <ChatThread pairingId={myBrief.pairing_id} />
          </>
        )}

        {!assignment && !myBrief && <p className="muted">{t('rounds.waiting.assignment')}</p>}
      </Fold>
    </div>
  )
}
