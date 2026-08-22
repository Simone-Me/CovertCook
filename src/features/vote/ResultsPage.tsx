import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChatThread } from '../chat/ChatThread'
import { getMyAssignment, getMyBrief, getResults } from '../../lib/rpc'
import { BackToTable } from '../../components/BackToTable'

export function ResultsPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()

  const { data: results, isLoading } = useQuery({
    queryKey: ['rounds', roundId, 'results'],
    enabled: !!roundId,
    queryFn: () => getResults(roundId as string),
  })
  // Reveal happens per-thread (get_thread unmasks other_party_* once the
  // round is RESULTS/ARCHIVED, regardless of anonymity) — surfacing both of
  // this player's own threads here means they don't have to remember where
  // to look for "who cooked for me" / "who I cooked for".
  const { data: assignment } = useQuery({
    queryKey: ['rounds', roundId, 'my-assignment'],
    enabled: !!roundId,
    queryFn: () => getMyAssignment(roundId as string),
  })
  const { data: myBrief } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief'],
    enabled: !!roundId,
    queryFn: () => getMyBrief(roundId as string),
  })

  if (isLoading) return <p className="muted">…</p>

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('results.title')}</h1>

      <div className="stack">
        {results?.map((r) => (
          <div key={r.brief_id} className="card row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>
                #{r.final_rank} {r.dish_name}
              </strong>
              <div className="muted">{t(`briefs.courseOption.${r.course}`)}</div>
              {r.award_keys.length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {r.award_keys.map((key) => (
                    <span key={key} className="badge">
                      {t(`results.award.${key}`, key)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="muted">{t('results.points', { points: r.borda_points.toFixed(1) })}</span>
          </div>
        ))}
      </div>

      {assignment && (
        <>
          <h2>{t('results.whoCookedForYou')}</h2>
          <ChatThread pairingId={assignment.pairing_id} />
        </>
      )}

      {myBrief && (
        <>
          <h2>{t('results.whoYouCookedFor')}</h2>
          <ChatThread pairingId={myBrief.pairing_id} />
        </>
      )}
    </div>
  )
}
