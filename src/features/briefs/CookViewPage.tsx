import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChatThread } from '../chat/ChatThread'
import {
  acknowledgeBrief,
  chooseBrief,
  getMessageTemplates,
  getMyBriefOffers,
  sendMessage,
  CHOICE_CLOSED,
} from '../../lib/rpc'
import { useQueryClient } from '@tanstack/react-query'
import { useRound } from '../rounds/hooks'
import { useAuth } from '../../lib/auth'
import { BackToTable } from '../../components/BackToTable'

/**
 * The recipe you were dealt, and — before it exists — the page it will arrive
 * on.
 *
 * THE EMPTY STATE IS THE INTERESTING HALF. This screen used to render one grey
 * line, "no recipe to show yet", and nothing else. Everything a cook in that
 * position could actually do was behind it: the conversation with the chef
 * writing for them lives on this page and this page is its only door, so for
 * exactly as long as there was something to ask about, there was nowhere to ask
 * it. The page appeared at the moment it stopped being needed.
 *
 * So the layout stays and the content goes. Same heading, same course on the
 * badge — it was dealt by the roulette and is true before anything is written —
 * same two sections, ruled and blank, the way a page in a recipe book waiting
 * to be filled in looks. What the reader learns from the shape is that nothing
 * is broken and nothing is lost: this is a page that has not been written yet.
 *
 * And the one thing to do about it is on it: a reminder, in one tap. The canned
 * phrase has been in the database since 0010 and raises a host alert behind it,
 * so a chef who has been given nothing three days before the dinner is heard by
 * the person who wrote for them AND by the Executive Chef, without either being
 * accused of anything.
 */
export function CookViewPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()
  const locale = profile?.locale ?? 'en'

  const queryClient = useQueryClient()
  const { data: round } = useRound(roundId)
  const { data: offers, isLoading } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief'],
    enabled: !!roundId,
    queryFn: () => getMyBriefOffers(roundId as string),
  })
  // Which one is on the page. Null means "whichever is the dish" — the normal
  // case, and the only case on a free dinner.
  const [reading, setReading] = useState<string | null>(null)
  const { data: templates } = useQuery({
    queryKey: ['message-templates', locale],
    queryFn: () => getMessageTemplates(locale),
  })
  const [cannotCookSent, setCannotCookSent] = useState(false)
  const [remindedSent, setRemindedSent] = useState(false)
  const [acked, setAcked] = useState(false)
  const [acking, setAcking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onAcknowledge() {
    if (!roundId) return
    setError(null)
    setAcking(true)
    try {
      await acknowledgeBrief(roundId)
      setAcked(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setAcking(false)
    }
  }

  // One tap, one canned sentence, sent into the thread that is already on this
  // page — not a second kind of message with its own inbox. `send_message`
  // rate-limits it and raises the host alert; nothing about that is this
  // page's business beyond offering it once.
  async function onSendCanned(
    category: 'CANNOT_COOK' | 'NO_BRIEF',
    onSent: (sent: boolean) => void,
  ) {
    if (!brief) return
    const template = templates?.find((tpl) => tpl.category === category)
    if (!template) return
    setError(null)
    setBusy(true)
    try {
      await sendMessage({ pairingId: brief.pairing_id, templateId: template.id, slotValue: null })
      onSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <p className="muted">…</p>

  // No pairing at all, which is a different thing from no recipe: the roulette
  // has not dealt this player a dish to cook. There is no thread to open and
  // nobody to remind.
  if (!offers || offers.length === 0) {
    return <p className="muted">{t('briefs.noBriefYet')}</p>
  }

  // Everything actually written. A pairing with nothing on it comes back as
  // one row of nulls — the LEFT join — which is "not written yet" rather than
  // an offer of nothing.
  const written = offers.filter((o) => o.brief_id !== null)
  const chosen = written.find((o) => o.chosen) ?? null
  const brief = written.find((o) => o.brief_id === reading) ?? chosen ?? offers[0]
  const waiting = brief.brief_id === null
  // Up to the dinner itself, which is when somebody standing in a kitchen at
  // six o'clock changes their mind — the case the whole feature is for. The
  // server decides; this only matches it so the button is not offered into a
  // refusal.
  const canChoose = ['ASSIGNED', 'BRIEFS_CLOSED', 'DINNER'].includes(round?.status ?? '')

  async function onChoose(briefId: string) {
    setError(null)
    setBusy(true)
    try {
      await chooseBrief(briefId)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'my-brief'] })
      setReading(null)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === CHOICE_CLOSED ? t('briefs.offers.closed') : raw || t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{waiting ? t('briefs.waiting.title') : brief.dish_name}</h1>
      <span className="badge">{t(`briefs.courseOption.${brief.course}`)}</span>
      {error && <div className="error">{error}</div>}

      {/* MORE THAN ONE IDEA, AND THE CHOICE IS YOURS.
          Only where the sender actually wrote more than one — on every other
          dinner this row does not exist, because a chooser with one option is
          a control that teaches people it does nothing.
          The dish is marked rather than merely selected: you can read the
          other one without changing what you are cooking, and swapping is a
          separate, deliberate press. Reading is not choosing. */}
      {written.length > 1 && (
        <div className="stack">
          <div className="row ideatabs" role="tablist" aria-label={t('briefs.offers.label')}>
            {written.map((o) => (
              <button
                key={o.brief_id}
                type="button"
                role="tab"
                aria-selected={o.brief_id === brief.brief_id}
                className={o.brief_id === brief.brief_id ? 'ideatab is-now' : 'ideatab secondary'}
                onClick={() => setReading(o.brief_id)}
              >
                {o.dish_name}
                {o.chosen && <span className="ideatab__mark" aria-hidden="true"> ✓</span>}
              </button>
            ))}
          </div>
          {brief.chosen ? (
            <p className="muted" style={{ margin: 0 }}>{t('briefs.offers.thisIsIt')}</p>
          ) : canChoose ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => brief.brief_id && onChoose(brief.brief_id)}
            >
              {t('briefs.offers.cookThisOne')}
            </button>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{t('briefs.offers.closed')}</p>
          )}
        </div>
      )}

      <div className="card stack">
        {waiting ? (
          <>
            <p className="notice notice--wanting">{t('briefs.waiting.body')}</p>

            {/* The sections stay, ruled and empty. A page with its headings
                still on it says "not written yet"; a page with them removed
                says "nothing here", and those are different sentences. */}
            <h2>{t('briefs.ingredients')}</h2>
            <div className="recipe__blank" aria-hidden="true" />
            <h2>{t('briefs.procedure')}</h2>
            <div className="recipe__blank recipe__blank--tall" aria-hidden="true" />
          </>
        ) : (
          <>
            {brief.difficulty && (
              <p className="muted">
                {t('briefs.difficulty')}: {brief.difficulty}/5
              </p>
            )}
            {brief.prep_minutes && (
              <p className="muted">
                {t('briefs.prepMinutes')}: {brief.prep_minutes}
              </p>
            )}
            {brief.est_cost && (
              <p className="muted">
                {t('briefs.estCost')}: {brief.est_cost}
              </p>
            )}

            <h2>{t('briefs.ingredients')}</h2>
            <ul>
              {brief.ingredients.map((ing, i) => (
                <li key={i}>
                  {[ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}
                </li>
              ))}
            </ul>

            <h2>{t('briefs.procedure')}</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{brief.procedure}</p>

            {brief.external_url && (
              <p>
                <a href={brief.external_url} target="_blank" rel="noreferrer">
                  {brief.external_url}
                </a>
              </p>
            )}

            {brief.note_to_cook && (
              <>
                <h2>{t('briefs.noteToCook')}</h2>
                <p>{brief.note_to_cook}</p>
              </>
            )}

            {brief.contains_tags.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {brief.contains_tags.map((tag) => (
                  <span key={tag} className="badge">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {waiting ? (
        /* The one act available while the page is blank. Offered once: a
           reminder you can press five times is not a reminder, and the thread
           underneath is where anything further belongs. */
        <div className="row">
          {!remindedSent ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSendCanned('NO_BRIEF', setRemindedSent)}
            >
              {t('briefs.waiting.remind')}
            </button>
          ) : (
            <p className="muted">{t('briefs.waiting.reminded')}</p>
          )}
        </div>
      ) : (
        /* Two opposite answers, and until now only the unhappy one existed:
           a cook could raise CANNOT_COOK or say nothing at all, so a sender
           who wrote a recipe never learned whether it landed. */
        <div className="row">
          {brief.acknowledged || acked ? (
            <p className="muted">{t('briefs.acknowledged')}</p>
          ) : (
            <button type="button" disabled={acking} onClick={onAcknowledge}>
              {t('briefs.acknowledge')}
            </button>
          )}
          {/* Two answers and no more. A row of variations made the choice look
              like a personality quiz, when it is really one bit: can you cook
              this or not. Whatever the problem actually is gets said in the
              conversation underneath, where the sender can answer. */}
          {!cannotCookSent ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => onSendCanned('CANNOT_COOK', setCannotCookSent)}
            >
              {t('briefs.cannotCook')}
            </button>
          ) : (
            <p className="muted">{t('briefs.cannotCookSent')}</p>
          )}
        </div>
      )}

      <h2>{t('chat.title')}</h2>
      <ChatThread pairingId={brief.pairing_id} roundId={roundId} />
    </div>
  )
}
