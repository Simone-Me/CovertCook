import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { faceFor } from '../../lib/themes'
import { useRound } from '../rounds/hooks'
import {
  getBoard,
  getMessageTemplates,
  markBoardRead,
  postToBoard,
  blockMember,
  notifyHostOfAlert,
  reportBoardMessage,
  type MessageTemplate,
} from '../../lib/rpc'

// The Fridge: the one place in a covered dinner where the whole table talks
// at once. Drawn as the inside of an open fridge because that is the room
// this app is actually set in, and because a shelf is a better shape for a
// short cheerful line than a card is.
//
// The phrases are still canned (README §"Anonymity is layered"): no free
// text, so writing style can't out anyone before the reveal.

// The icon is drawn from the author's name, so it stays with them for the
// whole evening: Chef Persil is always the carrot. That is the point now —
// you can see who said what and answer them (0037). It was deliberately the
// opposite before, keyed to the message id so nobody could be followed; that
// anonymity was given up knowingly, and real identities are still the game's
// secret.
//
// The palette it draws from is the dinner's own pseudonym list (0072): a
// brigade of stations wearing vegetables was the host's choice of theme being
// thrown away at the one screen where the whole table is looking at each
// other. See lib/themes.ts — faceFor() is the same hash, over a different set.

// The rolling pin. Horizontal, and mostly handles — that is what makes a
// rolling pin recognisable, and leaving them off is why the first attempt
// read as a cropped list instead of an object.
//
// The phrases scroll TOP TO BOTTOM, not side to side. That is the direction a
// pin actually turns: the surface rolls away from you over the top and comes
// back underneath, so a phrase rises into the light band across the middle and
// leaves under it. Scrolling sideways would be the pin sliding along the
// counter, which is not the gesture.
//
// Underneath it is an ordinary vertical scroll container with snap points, so
// the wheel, a swipe, Tab and the arrow keys all still work. The barrel is
// shading — a bright band across the middle, shadow top and bottom — not a
// widget pretending to be 3D.
function RollingPin({
  phrases,
  disabled,
  onPick,
}: {
  phrases: MessageTemplate[]
  disabled: boolean
  onPick: (id: string) => void
}) {
  const { t } = useTranslation()
  const barrel = useRef<HTMLDivElement>(null)
  // The hint retires the moment the pin is actually turned — it exists to
  // teach the gesture once, not to decorate the control forever.
  const [untouched, setUntouched] = useState(true)

  // The egg. Throwing it picks and sends in one gesture — the same commitment
  // as tapping a phrase — and rolls the pin to the phrase it chose, so you
  // see what you just said instead of having to go and look.
  function throwEgg() {
    if (phrases.length === 0) return
    const pick = phrases[Math.floor(Math.random() * phrases.length)]
    barrel.current?.querySelector(`[data-tpl="${pick.id}"]`)?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    })
    onPick(pick.id)
  }

  return (
    <div className="pinrow">
      <div className="pin">
        <span className="pin__handle" aria-hidden="true" />
        <div className="pin__wrap">
          <div
            className="pin__barrel"
            ref={barrel}
            data-untouched={untouched ? 'true' : 'false'}
            onScroll={() => setUntouched(false)}
          >
            {phrases.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                data-tpl={tpl.id}
                className="pin__slat"
                disabled={disabled}
                onClick={() => onPick(tpl.id)}
              >
                {tpl.body}
              </button>
            ))}
          </div>
          {/* Says the pin turns. A flat cylinder gives no hint that there is
              anything above or below the phrase in the light. */}
          <span className="pin__scroll" aria-hidden="true">
            ⌄
          </span>
        </div>
        <span className="pin__handle" aria-hidden="true" />
      </div>

      <button
        type="button"
        className="egg"
        disabled={disabled || phrases.length === 0}
        onClick={throwEgg}
        title={t('board.throwEgg')}
        aria-label={t('board.throwEgg')}
      >
        🥚
      </button>
    </div>
  )
}

export function FridgeBoard({ roundId, isDinnerDay }: { roundId: string; isDinnerDay: boolean }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const locale = profile?.locale ?? 'en'
  // Only for the faces. The round row is already in the cache — the page above
  // this one reads it — so this is a cache hit, not a second request.
  const { data: round } = useRound(roundId)

  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: board } = useQuery({
    queryKey: ['rounds', roundId, 'board'],
    queryFn: () => getBoard(roundId),
    refetchInterval: 20000,
  })

  const { data: templates } = useQuery({
    queryKey: ['message-templates', locale],
    queryFn: () => getMessageTemplates(locale),
  })

  // Opening the fridge is what clears its mark on the envelope — never a
  // timer. A badge that fades by itself stops meaning anything (0022, 0034).
  useEffect(() => {
    markBoardRead(roundId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'board-unread'] }))
      .catch(() => {})
  }, [roundId, board?.length, queryClient])

  // The roller swaps its contents on the day, it does not grow. "What a
  // lovely day!" is not what anybody needs to say at 19:40 with a dish in the
  // oven, and "I'm running 30 minutes late" means nothing the week before.
  // Two sets, one at a time.
  const phrases =
    templates?.filter((tpl) => tpl.category === 'BOARD' && tpl.day_of === isDinnerDay) ?? []

  async function onPost(templateId: string) {
    setError(null)
    setPosting(true)
    try {
      await postToBoard(roundId, templateId)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'board'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === 'RATE_LIMIT' ? t('board.rateLimit') : raw || t('errors.generic'))
    } finally {
      setPosting(false)
    }
  }

  async function onReport(messageId: string) {
    await reportBoardMessage(messageId)
    // The host is told there is something waiting rather than left to find it
    // (0059). Not awaited: the report is already recorded.
    void notifyHostOfAlert(roundId)
    await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'board'] })
  }

  // By seat, so nobody has to learn who somebody is to decide they would rather
  // not sit with them again. Their phrases leave this board immediately; the
  // dinner already under way is untouched, because three other people's evening
  // is built on the chain.
  async function onBlock(memberId: string) {
    await blockMember(memberId)
    await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'board'] })
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      {/* The picture is the back of the compartment and it does not move: it
          is painted on the container at a fixed height, and the messages
          scroll over it in the window. Growing the fridge to fit the
          conversation would turn a room into a background. */}
      <div className="fridge">
        <div className="fridge__stack">
          {board?.length === 0 && <p className="muted fridge__empty">{t('board.empty')}</p>}
          {board?.map((m) =>
            // A notice from the Executive Chef (0080). It wears no face and
            // carries no buttons: there is no seat behind it to report or to
            // block, and it is signed on purpose — the one phrase in this
            // fridge that is not anonymous is the one that had to be.
            m.from_host ? (
              <div key={m.message_id} className="chat-bubble chat-bubble--notice">
                <span className="chat-bubble__food" aria-hidden="true">
                  📣
                </span>
                <span className="chat-bubble__body">
                  <span className="chat-bubble__who">{t('board.fromExecutiveChef')}</span>
                  <span>{m.body}</span>
                </span>
              </div>
            ) : (
              <div key={m.message_id} className={`chat-bubble chat-bubble--food${m.is_mine ? ' mine' : ''}`}>
                <span className="chat-bubble__food" aria-hidden="true">
                  {faceFor(m.author_name ?? '', round?.name_theme)}
                </span>
                <span className="chat-bubble__body">
                  {/* Your own name would be telling you something you know. */}
                  {!m.is_mine && <span className="chat-bubble__who">{m.author_name}</span>}
                  <span>{m.body}</span>
                  <span className="row chat-bubble__foot">
                    {m.reported ? (
                      <span className="muted">{t('chat.reported')}</span>
                    ) : (
                      !m.is_mine &&
                      m.author_member_id && (
                        <>
                          <button
                            type="button"
                            className="chef-remove"
                            title={t('chat.report')}
                            aria-label={t('chat.report')}
                            onClick={() => onReport(m.message_id)}
                          >
                            ⚑
                          </button>
                          <button
                            type="button"
                            className="chef-remove"
                            title={t('moderation.block')}
                            aria-label={t('moderation.block')}
                            onClick={() => onBlock(m.author_member_id as string)}
                          >
                            🚫
                          </button>
                        </>
                      )
                    )}
                  </span>
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      <RollingPin phrases={phrases} disabled={posting} onPick={onPost} />
    </div>
  )
}
