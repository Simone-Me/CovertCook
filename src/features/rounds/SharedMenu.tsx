import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getRoundDishes, MENU_NOT_SHARED } from '../../lib/rpc'

/**
 * The dishes already sent, named and unattributed.
 *
 * WHAT IT IS FOR, AND IT IS ONE THING. Three people writing a tiramisù. In
 * FREE mode nothing else prevents it and the table finds out at the buffet.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a leaderboard of who has finished, not a
 * list of who is cooking what, not a preview of the recipes. Course and name,
 * which is all get_round_dishes returns (0087) — the server does not have a
 * mode where it would return more.
 *
 * Silent when the dinner did not ask for this: the RPC refuses rather than
 * returning nothing, so a closed menu and an empty one can be told apart, and
 * a closed one renders nothing at all rather than an empty heading.
 */
export function SharedMenu({ roundId }: { roundId: string | undefined }) {
  const { t } = useTranslation()

  const { data, error } = useQuery({
    queryKey: ['rounds', roundId, 'shared-dishes'],
    enabled: !!roundId,
    queryFn: () => getRoundDishes(roundId as string),
    retry: false,
    staleTime: 30 * 1000,
  })

  const closed = error instanceof Error && error.message === MENU_NOT_SHARED
  if (closed || !data) return null

  return (
    <div className="menucard">
      <p className="menucard__head">{t('rounds.sharedMenu.title')}</p>
      {data.length === 0 ? (
        <p className="menucard__note">{t('rounds.sharedMenu.nothingYet')}</p>
      ) : (
        <ul className="menucard__list">
          {data.map((d, i) => (
            <li key={`${d.course}-${d.dish_name}-${i}`} className="menucard__course">
              <span className="menucard__name">{d.dish_name}</span>
              <span className="menucard__course-kind">{t(`briefs.courseOption.${d.course}`)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="menucard__note">{t('rounds.sharedMenu.why')}</p>
    </div>
  )
}
