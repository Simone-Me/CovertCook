import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound } from './hooks'
import { getHostAlerts, getReportedMessages, resolveHostAlert } from '../../lib/rpc'
import { BackToTable } from '../../components/BackToTable'
import { formatMoment, machineMoment } from '../../lib/datetime'

export function HostAlertsPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: round, isLoading: roundLoading } = useRound(roundId)
  const { data: alerts } = useQuery({
    queryKey: ['rounds', roundId, 'host-alerts'],
    enabled: !!roundId,
    queryFn: () => getHostAlerts(roundId as string),
  })
  const { data: reported } = useQuery({
    queryKey: ['rounds', roundId, 'reported-messages'],
    enabled: !!roundId,
    queryFn: () => getReportedMessages(roundId as string),
  })

  if (roundLoading || !round) return <p className="muted">…</p>
  const isHost = round.host_id === profile?.id
  if (!isHost) return <Navigate to={`/rounds/${roundId}`} replace />

  async function onResolve(alertId: string) {
    await resolveHostAlert(alertId)
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'host-alerts'] })
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('alerts.title')}</h1>

      <h2>{t('alerts.openAlerts')}</h2>
      {alerts && alerts.length === 0 && <p className="muted">{t('alerts.none')}</p>}
      <div className="stack">
        {alerts?.map((a) => (
          <div key={a.id} className="card row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{t(`alerts.kind.${a.kind}`)}</strong>
              {/* In the reader's zone and the reader's language. It used to
                  be a bare toLocaleString(), which takes the language from
                  the phone rather than from the account — French app, English
                  dates. The zone was already right and always has been: the
                  column stores an instant, not a wall clock (lib/datetime). */}
              <time className="muted" dateTime={machineMoment(a.created_at)}>
                {formatMoment(a.created_at, profile?.locale ?? 'en')}
              </time>
            </div>
            <button type="button" className="secondary" onClick={() => onResolve(a.id)}>
              {t('alerts.resolve')}
            </button>
          </div>
        ))}
      </div>

      <h2>{t('alerts.reportedMessages')}</h2>
      {reported && reported.length === 0 && <p className="muted">{t('alerts.noReports')}</p>}
      <div className="stack">
        {reported?.map((m) => (
          <div key={m.message_id} className="card">
            <div className="muted">
              {t(`chat.category.${m.category}`)} — {m.created_day}
            </div>
            <div>{m.slot_value ? m.body.replace(/\{[^}]+\}/, m.slot_value) : m.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
