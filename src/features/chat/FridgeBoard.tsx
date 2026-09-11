import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { faceFor } from '../../lib/themes'
import { useRound } from '../rounds/hooks'
import {
  getBoard,
  type BoardMessage,
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

/**
 * The fridge, ordered so an answer sits under what it answers (0083).
 *
 * The rows arrive in the order they were said, which is the honest order and
 * the unreadable one: somebody answers a line from eleven phrases ago and the
 * answer lands at the bottom, next to a conversation it has nothing to do
 * with. So each reply is lifted to sit directly under its parent, and the wire
 * drawn beside it has something to point at.
 *
 * A reply whose parent has fallen out of the 24-hour window has nothing to sit
 * under, so it stays where it was said and quotes instead — see the stub in
 * the bubble. Depth is capped at three because the indent is a hint about who
 * is answering whom, not a tree view: a fridge is 82% of a phone wide.
 */
function arrange(rows: BoardMessage[] | undefined): { m: BoardMessage; depth: number }[] {
  const list = rows ?? []
  const present = new Set(list.map((m) => m.message_id))
  const answers = new Map<string, BoardMessage[]>()
  const roots: BoardMessage[] = []

  for (const m of list) {
    if (m.reply_to && present.has(m.reply_to)) {
      const kin = answers.get(m.reply_to) ?? []
      kin.push(m)
      answers.set(m.reply_to, kin)
    } else {
      roots.push(m)
    }
  }

  const out: { m: BoardMessage; depth: number }[] = []
  function walk(m: BoardMessage, depth: number) {
    out.push({ m, depth })
    for (const kid of answers.get(m.message_id) ?? []) walk(kid, Math.min(depth + 1, 3))
  }
  roots.forEach((m) => walk(m, 0))
  return out
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
  // What the next phrase will answer, if anything. Held here rather than on the
  // bubble: the pin is what sends, so the pin is what has to say where the
  // phrase is going — a reply armed on a message forty lines up and forgotten
  // is a line landing in the wrong conversation.
  const [answering, setAnswering] = useState<BoardMessage | null>(null)

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

  // Answers under what they answer, once per fetch rather than once per render.
  const shelf = useMemo(() => arrange(board), [board])

  async function onPost(templateId: string) {
    setError(null)
    setPosting(true)
    try {
      await postToBoard(roundId, templateId, answering?.message_id ?? null)
      setAnswering(null)
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
    setAnswering((cur) => (cur?.message_id === messageId ? null : cur))
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
    // An answer armed on a phrase that is about to leave the fridge would be
    // sent into a hole: the wire would point at a line this reader can no
    // longer see, and post_to_board would happily store it.
    setAnswering((cur) => (cur?.author_member_id === memberId ? null : cur))
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
          {shelf.map(({ m, depth }) =>
            // A notice from the Executive Chef (0080). It wears no face and it
            // can be neither reported nor blocked: there is no seat behind it,
            // and it is signed on purpose — the one phrase in this fridge that
            // is not anonymous is the one that had to be. It CAN be answered,
            // though, and that is not a contradiction: a notice is the host
            // saying something to the table, and a table that cannot answer is
            // being announced at rather than talked to.
            m.from_host ? (
              <div key={m.message_id} className="chat-bubble chat-bubble--notice">
                <span className="chat-bubble__food" aria-hidden="true">
                  📣
                </span>
                <span className="chat-bubble__body">
                  <span className="chat-bubble__who">{t('board.fromExecutiveChef')}</span>
                  <span>{m.body}</span>
                  <span className="row chat-bubble__foot">
                    <span className="chat-acts">
                      <button
                        type="button"
                        className="chat-act"
                        title={t('board.reply')}
                        aria-label={t('board.reply')}
                        aria-pressed={answering?.message_id === m.message_id}
                        onClick={() =>
                          setAnswering((cur) => (cur?.message_id === m.message_id ? null : m))
                        }
                      >
                        ↩
                      </button>
                    </span>
                  </span>
                </span>
              </div>
            ) : (
              <div
                key={m.message_id}
                className={[
                  'chat-bubble chat-bubble--food',
                  m.is_mine ? 'mine' : '',
                  // The wire. Drawn only when the line it answers is actually
                  // above it — an answer to something that has left the fridge
                  // quotes instead, below.
                  depth > 0 ? 'chat-bubble--tied' : '',
                  answering?.message_id === m.message_id ? 'is-answering' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                // The indent is the only part of the tie that has to be a
                // number: the elbow is drawn in the gutter it opens up, and it
                // opens on the side the bubble is already on.
                style={
                  depth > 0
                    ? m.is_mine
                      ? { marginRight: depth * 16 }
                      : { marginLeft: depth * 16 }
                    : undefined
                }
              >
                {/* The elbow itself: up out of the phrase above, a right angle,
                    and a knot where it meets this one. Drawn rather than
                    written, so it costs nothing to read. */}
                {depth > 0 && <span className="chat-tie" aria-hidden="true" />}

                <span className="chat-bubble__food" aria-hidden="true">
                  {faceFor(m.author_name ?? '', round?.name_theme)}
                </span>
                <span className="chat-bubble__body">
                  {/* Your own name would be telling you something you know. */}
                  {!m.is_mine && <span className="chat-bubble__who">{m.author_name}</span>}

                  {/* What it answers, when what it answers is no longer here.
                      The fridge only keeps a day (0034), so an answer can
                      outlive its question — and a wire pointing at nothing is
                      worse than a quotation. */}
                  {depth === 0 && m.reply_to && m.reply_to_body && (
                    <span className="chat-bubble__quote">
                      {/* No pseudonym on the quoted line means it was the
                          Executive Chef's: theirs is the only phrase in the
                          fridge with no seat behind it. */}
                      <span className="chat-bubble__quote-who">
                        {m.reply_to_author ?? t('board.fromExecutiveChef')}
                      </span>
                      {m.reply_to_body}
                    </span>
                  )}

                  <span>{m.body}</span>
                  <span className="row chat-bubble__foot">
                    {m.reported ? (
                      <span className="muted">{t('chat.reported')}</span>
                    ) : (
                      !m.is_mine &&
                      m.author_member_id && (
                        // THE THREE MARKS, ON SOMETHING. They were three grey
                        // glyphs at 55% opacity on a photograph of a fridge
                        // full of groceries, which is to say they were
                        // invisible — people could not find the way to report
                        // a phrase, let alone answer one. The same three marks
                        // now sit on a small tinted plate in the table's own
                        // red, which is what makes them read as controls.
                        <span className="chat-acts">
                          <button
                            type="button"
                            className="chat-act"
                            title={t('board.reply')}
                            aria-label={t('board.reply')}
                            aria-pressed={answering?.message_id === m.message_id}
                            onClick={() =>
                              setAnswering((cur) =>
                                cur?.message_id === m.message_id ? null : m,
                              )
                            }
                          >
                            ↩
                          </button>
                          <button
                            type="button"
                            className="chat-act"
                            title={t('chat.report')}
                            aria-label={t('chat.report')}
                            onClick={() => onReport(m.message_id)}
                          >
                            ⚑
                          </button>
                          <button
                            type="button"
                            className="chat-act"
                            title={t('moderation.block')}
                            aria-label={t('moderation.block')}
                            onClick={() => onBlock(m.author_member_id as string)}
                          >
                            🚫
                          </button>
                        </span>
                      )
                    )}
                  </span>
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      {/* Where the next phrase is going, said above the thing that sends it.
          The pin is one tap from posting, so an armed reply that lived only as
          a highlight forty lines up would be a line landing in the wrong
          conversation — and the way out of it has to be here too. */}
      {answering && (
        <div className="chat-answering">
          <span className="chat-answering__what">
            {t('board.replyingTo', {
              // A notice has no seat behind it, so it has no pseudonym either —
              // it is answered by name, the same name it was signed with.
              name: answering.from_host
                ? t('board.fromExecutiveChef')
                : (answering.author_name ?? ''),
            })}
            <em>{answering.body}</em>
          </span>
          <button
            type="button"
            className="chat-act"
            title={t('board.replyCancel')}
            aria-label={t('board.replyCancel')}
            onClick={() => setAnswering(null)}
          >
            ×
          </button>
        </div>
      )}

      <RollingPin phrases={phrases} disabled={posting} onPick={onPost} />
    </div>
  )
}
