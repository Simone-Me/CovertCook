import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound } from './hooks'
import {
  approveMember,
  getHostAlertsDetailed,
  hidePhoto,
  photoUrl,
  postHostNotice,
  rejectMember,
  resolveHostAlert,
  revealMessageAuthor,
  warnMember,
  NOTICE_ALREADY_POSTED,
  type HostAlertDetail,
  type HostNotice,
} from '../../lib/rpc'
import { RoundProNotice } from '../pro/ProNotices'
import { BackToTable } from '../../components/BackToTable'
import { Fold } from '../../components/Fold'
import { InlineConfirm } from '../../components/InlineConfirm'
import { formatMoment, machineMoment } from '../../lib/datetime'

/**
 * WHAT IS WAITING FOR THE EXECUTIVE CHEF, AND WHAT CAN BE DONE ABOUT IT.
 *
 * This page used to print the name of an enum value and a date. Twelve
 * different events reached it and five names were available, so most of them
 * arrived as "Other" — and the payload holding the difference was never read.
 * Resolving one made the row vanish with nothing learned, which is the worst
 * possible thing a moderation screen can do: it teaches the host that pressing
 * the button is how you make the number go down.
 *
 * So every row opens. Inside is what happened, to whom, where, and what a
 * person might do about it — and only then the actions, which are different
 * for every kind and are never more than two plus "resolved".
 *
 * The reported-messages list that used to sit underneath is gone into these
 * rows. It was a second copy of the same events with different actions on it,
 * and a host reading one had no way of knowing the other existed.
 */
export function HostAlertsPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()

  const { data: round, isLoading: roundLoading } = useRound(roundId)
  const { data: alerts } = useQuery({
    queryKey: ['rounds', roundId, 'host-alerts'],
    enabled: !!roundId,
    queryFn: () => getHostAlertsDetailed(roundId as string),
  })

  if (roundLoading || !round) return <p className="muted">…</p>
  const isHost = round.host_id === profile?.id
  if (!isHost) return <Navigate to={`/rounds/${roundId}`} replace />

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('alerts.title')}</h1>

      {/* Said before the first row rather than after the last: this is the rule
          the screen is built on, and a reader who learns it afterwards has
          already formed an opinion under the other one. In SPY and OPEN the
          host knows the names anyway, so the sentence has two versions and the
          round decides which is true. */}
      <p className="muted">
        {t(round.anonymity === 'ANONYMOUS' ? 'moderation.byPseudonym' : 'moderation.namesAreKnown')}
      </p>

      {/* The one thing on this page that is not an alert and cannot be
          resolved: this dinner's Crème cover running out. It belongs here
          because this is where a host comes to find out what needs them, and
          it stays out of the count on the bell because that number is a number
          of things that can be dealt with. Same component as the round page —
          one sentence, written once. */}
      <RoundProNotice round={round} isHost />

      {alerts && alerts.length === 0 && <p className="muted">{t('alerts.none')}</p>}

      <div className="stack">
        {alerts?.map((alert) => (
          <AlertCard key={alert.alert_id} roundId={roundId as string} alert={alert} />
        ))}
      </div>
    </div>
  )
}

/**
 * One thing that happened, folded shut.
 *
 * `<details>` rather than a state toggle, like every other fold in this app:
 * it is a disclosure, and the element that means disclosure already handles
 * the keyboard, the screen reader and find-in-page.
 */
function AlertCard({ roundId, alert }: { roundId: string; alert: HostAlertDetail }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const locale = profile?.locale ?? 'en'

  const [confirming, setConfirming] = useState<'flag' | 'reveal' | null>(null)
  const [reason, setReason] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = t(`alerts.kind.${alert.alert_type}`, { defaultValue: t('alerts.kind.UNKNOWN') })

  /**
   * Every action ends the same way: both lists forget what they knew.
   *
   * The second key is the one that was missing and is the whole of the "I
   * pressed resolve and the number stayed at 3" complaint — the bell reads
   * `my-open-alerts`, which is a different query against a different function,
   * and nothing here had ever told it that anything had changed. It refetched
   * on its own a minute later, which is a minute of a host believing the
   * button does not work.
   */
  async function run(fn: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'host-alerts'] })
      await queryClient.invalidateQueries({ queryKey: ['my-open-alerts'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(
        raw === NOTICE_ALREADY_POSTED
          ? t('alerts.errors.NOTICE_ALREADY_POSTED')
          : t(`moderation.errors.${raw}`, { defaultValue: raw || t('errors.generic') }),
      )
    } finally {
      setBusy(false)
    }
  }

  const resolve = () => run(() => resolveHostAlert(alert.alert_id))

  /** A notice to the whole table, and then this is dealt with: saying it is
   *  the answer to the question the alert asked. */
  const say = (key: HostNotice) =>
    run(async () => {
      await postHostNotice(roundId, key)
      await resolveHostAlert(alert.alert_id)
    })

  const flag = () =>
    run(async () => {
      if (alert.seat_id) {
        await warnMember({
          roundId,
          memberId: alert.seat_id,
          // Only a phrase in a private thread has an id a warning can hold on
          // to. A fridge phrase and a photograph live in their own tables.
          messageId: alert.seat_message_id,
        })
      }
      if (alert.seat_photo_id) await hidePhoto(alert.seat_photo_id)
      await resolveHostAlert(alert.alert_id)
      setConfirming(null)
    })

  const answer = (approve: boolean) =>
    run(async () => {
      if (!alert.seat_id) return
      await (approve ? approveMember(roundId, alert.seat_id) : rejectMember(roundId, alert.seat_id))
      await resolveHostAlert(alert.alert_id)
    })

  const reported =
    alert.alert_type === 'REPORTED_PRIVATE' ||
    alert.alert_type === 'REPORTED_FRIDGE' ||
    alert.alert_type === 'REPORTED_PHOTO'

  return (
    <div className="card">
      <Fold title={name} aside={formatMoment(alert.happened_at, locale)}>
        <div className="stack">
          {/* WHEN, in the reader's zone and the reader's language. The machine
              form is on the element so the browser and anything reading the
              page aloud get the instant rather than the wording. */}
          <time className="muted" dateTime={machineMoment(alert.happened_at)}>
            {formatMoment(alert.happened_at, locale)}
          </time>

          {/* WHAT happened, and to whom. */}
          <p style={{ margin: 0 }}>
            {t(`alerts.what.${alert.alert_type}`, {
              defaultValue: t('alerts.what.UNKNOWN'),
              who: alert.who ?? t('alerts.someone'),
              counterpart: alert.counterpart ?? t('alerts.someone'),
              dish: alert.dish ?? t('alerts.aDish'),
            })}
          </p>

          {/* WHAT WAS SAID. Above the seat it came from, deliberately: knowing
              the author first is how an opinion of somebody decides whether
              their message was out of line. */}
          {alert.phrase && <blockquote className="reported__body">{alert.phrase}</blockquote>}

          {alert.photo_path && <PhotoPeek path={alert.photo_path} />}

          {alert.labels && alert.labels.length > 0 && (
            <p className="muted" style={{ margin: 0 }}>
              {t('alerts.declared', { labels: alert.labels.join(', ') })}
            </p>
          )}

          {/* The dish the cook is refusing. Whether a refusal is fair is not a
              question anybody can answer without reading the recipe, so it is
              here rather than a page away — folded, because it is long. */}
          {alert.recipe && (
            <Fold title={t('alerts.theRecipe', { dish: alert.dish ?? '' })}>
              <p className="reported__body" style={{ whiteSpace: 'pre-wrap' }}>
                {alert.recipe}
              </p>
            </Fold>
          )}

          {alert.already_warned && <p className="muted">{t('moderation.alreadyWarned')}</p>}
          {alert.answered && <p className="notice">{t('alerts.answered')}</p>}

          {/* HOW it might be resolved. Advice, not instruction: every one of
              these has a version where the right thing to do is nothing. */}
          <p className="muted" style={{ margin: 0 }}>
            {t(`alerts.how.${alert.alert_type}`, { defaultValue: t('alerts.how.UNKNOWN') })}
          </p>

          {error && <div className="error">{error}</div>}
          {revealed && <p className="notice">{t('moderation.revealed', { name: revealed })}</p>}

          {confirming === 'flag' ? (
            <InlineConfirm
              title={t('alerts.confirm.flagTitle')}
              confirmLabel={t('alerts.actions.flag')}
              busy={busy}
              onConfirm={flag}
              onCancel={() => setConfirming(null)}
            >
              <p className="confirmbox__why">{t('alerts.confirm.flagWhy')}</p>
            </InlineConfirm>
          ) : confirming === 'reveal' ? (
            <InlineConfirm
              title={t('moderation.revealTitle')}
              confirmLabel={t('moderation.revealConfirm')}
              busy={busy}
              onConfirm={() =>
                run(async () => {
                  setRevealed(await revealMessageAuthor(alert.seat_message_id as string, reason))
                  setConfirming(null)
                  setReason('')
                })
              }
              onCancel={() => setConfirming(null)}
            >
              <p className="confirmbox__why">{t('moderation.revealWhy')}</p>
              <label htmlFor={`reveal-${alert.alert_id}`}>{t('moderation.revealReason')}</label>
              <textarea
                id={`reveal-${alert.alert_id}`}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </InlineConfirm>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {(alert.alert_type === 'CANNOT_COOK' || alert.alert_type === 'NO_BRIEF') && (
                <button type="button" className="secondary" disabled={busy} onClick={() => say('HOST_RECIPE_REVIEW')}>
                  {t('alerts.actions.postRecipeReview')}
                </button>
              )}

              {alert.alert_type === 'ALLERGY_ALERT' && (
                <button type="button" className="secondary" disabled={busy} onClick={() => say('HOST_ALLERGEN_CARE')}>
                  {t('alerts.actions.postAllergenCare')}
                </button>
              )}

              {alert.alert_type === 'ENTER_REQUEST' && !alert.answered && (
                <>
                  <button type="button" disabled={busy} onClick={() => answer(true)}>
                    {t('alerts.actions.accept')}
                  </button>
                  <button type="button" className="secondary" disabled={busy} onClick={() => answer(false)}>
                    {t('alerts.actions.refuse')}
                  </button>
                </>
              )}

              {reported && alert.seat_id && (
                <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming('flag')}>
                  {t('alerts.actions.flag')}
                </button>
              )}

              {/* The one action here that hands over an identity, and it looks
                  like one: it asks for a reason in writing and it is recorded
                  in the dinner's audit log, permanently. Only ever offered on a
                  reported phrase, because that is the only thing the server
                  will reveal the author of. */}
              {alert.alert_type === 'REPORTED_PRIVATE' && alert.seat_message_id && (
                <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming('reveal')}>
                  {t('moderation.reveal')}
                </button>
              )}

              {/* Small, and last. Resolving is not an achievement — it is the
                  host saying they have read this and it is over. */}
              <button type="button" className="pillbtn" disabled={busy} onClick={resolve}>
                {reported ? t('alerts.actions.dontFlag') : t('alerts.resolve')}
              </button>
            </div>
          )}
        </div>
      </Fold>
    </div>
  )
}

/**
 * The photograph that was reported, at a size you can judge and not one you
 * can enjoy. The URL is signed and short-lived, which is why it is fetched
 * rather than built: the bucket is not public and never has been.
 */
function PhotoPeek({ path }: { path: string }) {
  const { t } = useTranslation()
  const { data: url } = useQuery({
    queryKey: ['photo-url', path],
    queryFn: () => photoUrl(path),
  })
  if (!url) return null
  return <img className="alert-photo" src={url} alt={t('alerts.reportedPhoto')} />
}
