import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BackToTable } from '../../components/BackToTable'
import { Fold } from '../../components/Fold'
import { ChatThread } from './ChatThread'
import { FridgeBoard } from './FridgeBoard'
import { getMyAssignment, getMyBriefOffers, pickChosenBrief } from '../../lib/rpc'
import { useRound } from '../rounds/hooks'

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
  const { data: round } = useRound(roundId)

  const { data: assignment } = useQuery({
    queryKey: ['rounds', roundId, 'my-assignment'],
    enabled: !!roundId,
    queryFn: () => getMyAssignment(roundId as string),
  })

  const { data: myBrief } = useQuery({
    // One key, one shape (see the note above the same query in
    // RoundHomePage). CookViewPage holds this exact key with the array, and a
    // fetcher here that returned a single row put an object in the cache for
    // it to call .filter() on — a throw during render, which is a blank page.
    // The row this screen wants is picked from the array instead.
    queryKey: ['rounds', roundId, 'my-brief'],
    enabled: !!roundId,
    queryFn: () => getMyBriefOffers(roundId as string).catch(() => []),
    select: pickChosenBrief,
  })

  if (!roundId) return null

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('board.pageTitle')}</h1>

      <Fold title={t('board.fridge')} hint={t('board.help')} defaultOpen>
        <FridgeBoard roundId={roundId} isDinnerDay={round?.status === 'DINNER'} />
      </Fold>

      <Fold title={t('board.yourChef')} hint={t('board.yourChefHelp')}>
        {/* Two conversations that look alike and are not alike: one is with
            the chef you are writing FOR, the other with the chef writing for
            you. Stacked under two plain headings they blurred together, so
            each gets its own case with its own name on the lid. */}
        {assignment && (
          <section className="threadbox">
            <header className="threadbox__lid">
              {/* The real name where the round hands one over — an OPEN
                  dinner, or a SPY host reading their own thread (0073).
                  get_my_assignment decides that; here it is simply printed
                  when it arrives. */}
              <span className="threadbox__who">
                {assignment.cook_display_name ?? assignment.cook_secret_name}
              </span>
              <span className="threadbox__what">{t('board.myOrder')}</span>
            </header>
            <ChatThread pairingId={assignment.pairing_id} roundId={roundId} />
          </section>
        )}

        {myBrief && (
          <section className="threadbox">
            <header className="threadbox__lid">
              {/* Covered on an ANONYMOUS dinner that is still running, and
                  named where the round hands the name over — an OPEN table, a
                  SPY Executive Chef, or an evening already over. 0081 wired
                  get_my_brief to the same rule the other five readers use; it
                  was the one screen still covering the author for the one
                  person entitled to read it. The bar is still covering a
                  placeholder rather than a name held back in the browser,
                  which is the only way .redact is allowed to be used. */}
              {myBrief.sender_display_name ? (
                <span className="threadbox__who">{myBrief.sender_display_name}</span>
              ) : (
                <span className="redact threadbox__who">{t('rounds.chefCovered')}</span>
              )}
              <span className="threadbox__what">{t('board.myDish')}</span>
            </header>
            <ChatThread pairingId={myBrief.pairing_id} roundId={roundId} />
          </section>
        )}

        {!assignment && !myBrief && <p className="muted">{t('rounds.waiting.assignment')}</p>}
      </Fold>
    </div>
  )
}
