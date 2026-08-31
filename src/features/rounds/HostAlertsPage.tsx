import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound } from './hooks'
import {
  getHostAlerts,
  getReportedMessages,
  resolveHostAlert,
  revealMessageAuthor,
  warnMember,
  type ReportedMessage,
} from '../../lib/rpc'
import { BackToTable } from '../../components/BackToTable'
import { InlineConfirm } from '../../components/InlineConfirm'
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
      {/* Said before the first message rather than after the last: this is the
          rule the screen is built on, and a reader who learns it afterwards has
          already formed an opinion under the other one. In SPY and OPEN the
          host knows the names anyway, so the sentence has two versions and the
          round decides which is true. */}
      <p className="muted">
        {t(round.anonymity === 'ANONYMOUS' ? 'moderation.byPseudonym' : 'moderation.namesAreKnown')}
      </p>
      {reported && reported.length === 0 && <p className="muted">{t('alerts.noReports')}</p>}
      <div className="stack">
        {reported?.map((m) => (
          <ReportedCard key={m.message_id} roundId={roundId as string} message={m} />
        ))}
      </div>
    </div>
  )
}

/**
 * One reported message, and what can be done about it.
 *
 * The message is on top and the seat underneath, in that order and not the
 * other way round. Knowing who wrote something first is how a host's opinion of
 * a person decides whether the thing was inappropriate — so the host reads the
 * phrase, then reads which seat it came from, and every action offered is about
 * the seat rather than about a name.
 *
 * The fourth action is the exception, and it looks like one: it asks for a
 * reason in writing, it is recorded in `audit_log`, and it is the only thing
 * on this page that hands over an identity.
 */
function ReportedCard({ roundId, message }: { roundId: string; message: ReportedMessage }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<'warn' | 'reveal' | null>(null)
  const [reason, setReason] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const text = message.slot_value ? message.body.replace(/\{[^}]+\}/, message.slot_value) : message.body

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'reported-messages'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(t(`moderation.errors.${raw}`, { defaultValue: raw || t('errors.generic') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <div className="muted">
        {t(`chat.category.${message.category}`)} — {message.created_day}
      </div>
      <blockquote className="reported__body">{text}</blockquote>

      <p className="muted" style={{ margin: 0 }}>
        {/* The real name where this host is entitled to it — a SPY or OPEN
            round, or one that is over (0073). Everywhere else it stays the
            seat, because every action on this card is about a seat rather than
            about a person, and the reveal below is the one deliberate
            exception. */}
        {t(message.author_display_name ? 'moderation.fromChef' : 'moderation.fromSeat', {
          name: message.author_display_name ?? message.author_secret_name ?? '—',
        })}
        {message.already_warned && ` · ${t('moderation.alreadyWarned')}`}
      </p>

      {error && <div className="error">{error}</div>}
      {revealed && <p className="notice">{t('moderation.revealed', { name: revealed })}</p>}

      {open === 'warn' ? (
        <div className="stack">
          <label htmlFor={`warn-${message.message_id}`}>{t('moderation.warnReason')}</label>
          <textarea
            id={`warn-${message.message_id}`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <div className="row">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await warnMember({
                    roundId,
                    memberId: message.author_member_id,
                    messageId: message.message_id,
                    reason,
                  })
                  setOpen(null)
                  setReason('')
                })
              }
            >
              {t('moderation.sendWarning')}
            </button>
            <button type="button" className="secondary" onClick={() => setOpen(null)}>
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : open === 'reveal' ? (
        <InlineConfirm
          title={t('moderation.revealTitle')}
          confirmLabel={t('moderation.revealConfirm')}
          busy={busy}
          onConfirm={() =>
            run(async () => {
              setRevealed(await revealMessageAuthor(message.message_id, reason))
              setOpen(null)
              setReason('')
            })
          }
          onCancel={() => setOpen(null)}
        >
          <p className="confirmbox__why">{t('moderation.revealWhy')}</p>
          <label htmlFor={`reveal-${message.message_id}`}>{t('moderation.revealReason')}</label>
          <textarea
            id={`reveal-${message.message_id}`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </InlineConfirm>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="secondary" onClick={() => setOpen('warn')}>
            {t('moderation.warn')}
          </button>
          {/* Removing is the roster's job and already lives there, with the
              choice about the chain it forces. Sending the host to it is
              better than growing a second, thinner copy of it here. */}
          <button type="button" className="secondary" onClick={() => setOpen('reveal')}>
            {t('moderation.reveal')}
          </button>
        </div>
      )}
    </div>
  )
}
