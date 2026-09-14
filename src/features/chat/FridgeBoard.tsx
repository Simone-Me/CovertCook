import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { faceFor } from '../../lib/themes'
import { useRound, useRoundMembers } from '../rounds/hooks'
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
  // Which opener the roller is currently answering. Null means it is offering
  // openers — the same control doing two jobs, which is what keeps the fridge
  // to one gesture instead of two.
  const [answering, setAnswering] = useState<string | null>(null)
  // A chef-shaped phrase waits here until a name is chosen for it. Held rather
  // than posted straight away, because the pin commits on a tap and this one
  // needs a second half.
  const [aiming, setAiming] = useState<string | null>(null)

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
  const board_ = templates?.filter((tpl) => tpl.category === 'BOARD') ?? []
  // Openers swap with the day, as before: "what a lovely day" is not what
  // anybody needs at 19:40 with a dish in the oven. Replies do not — an answer
  // is an answer whenever it is given.
  const phrases = answering
    ? board_.filter((tpl) => tpl.board_role === 'REPLY')
    : board_.filter((tpl) => tpl.board_role !== 'REPLY' && tpl.day_of === isDinnerDay)

  // Who can be named. The roster this dinner already shows on its own page,
  // so nothing new is disclosed — and the server checks the name again,
  // because a list in a browser is a suggestion (0088).
  const { data: members } = useRoundMembers(roundId)
  const chefs = (members ?? [])
    .filter((m) => m.status === 'ACTIVE' && m.approved)
    .map((m) => m.display_name ?? m.secret_name)
    .filter((n): n is string => !!n)

  async function onPost(templateId: string, slotValue: string | null = null) {
    // A phrase with a chef in it is not finished yet: it opens the name list
    // instead of going up half-written.
    const tpl = templates?.find((x) => x.id === templateId)
    if (tpl?.slot_source === 'MEMBER' && !slotValue) {
      setAiming(templateId)
      return
    }
    setError(null)
    setPosting(true)
    try {
      await postToBoard(roundId, templateId, slotValue, answering)
      setAnswering(null)
      setAiming(null)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'board'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(
        t(`board.errors.${raw}`, { defaultValue: '' }) ||
          (raw === 'RATE_LIMIT' ? t('board.rateLimit') : raw || t('errors.generic')),
      )
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
              <div
                key={m.message_id}
                className={`chat-bubble chat-bubble--food${m.is_mine ? ' mine' : ''}${
                  m.parent_id ? ' chat-bubble--reply' : ''
                }${answering === m.message_id ? ' is-answering' : ''}`}
              >
                {/* The wire between an answer and what it answers: up out of
                    the phrase above, one right angle, and a knot where it
                    meets this one. The indent alone said a reply was a reply;
                    it did not say WHICH line it was answering, which is the
                    only thing a reader of a fridge with three conversations in
                    it actually needs. */}
                {m.parent_id && <span className="chat-tie" aria-hidden="true" />}

                <span className="chat-bubble__food" aria-hidden="true">
                  {faceFor(m.author_name ?? '', round?.name_theme)}
                </span>
                <span className="chat-bubble__body">
                  {/* Your own name would be telling you something you know. */}
                  {!m.is_mine && <span className="chat-bubble__who">{m.author_name}</span>}
                  <span>{m.body}</span>

                  {/* THE MARKS SIT ON SOMETHING NOW. Three grey glyphs at half
                      opacity, over a photograph of a fridge full of groceries,
                      were invisible: people could not find the way to report a
                      phrase, let alone the way to answer one. The same marks on
                      a small plate in the table's own red read as controls
                      without shouting. */}
                  <span className="row chat-bubble__foot">
                    <span className="chat-acts">
                      {/* Answering is offered on openers only: one level, as
                          the server enforces. Pressing it does not send
                          anything — it turns the roller over to the replies. */}
                      {!m.parent_id && !m.reported && (
                        <button
                          type="button"
                          className="chat-act"
                          title={t('board.answer')}
                          aria-label={t('board.answer')}
                          aria-pressed={answering === m.message_id}
                          onClick={() => {
                            setAiming(null)
                            setAnswering((cur) => (cur === m.message_id ? null : m.message_id))
                          }}
                        >
                          ↩
                        </button>
                      )}
                      {m.reported ? (
                        <span className="muted">{t('chat.reported')}</span>
                      ) : (
                        !m.is_mine &&
                        m.author_member_id && (
                          <>
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
                          </>
                        )
                      )}
                    </span>
                  </span>
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      {/* What the roller is doing right now, and the way back. Without this
          line the pin silently holds a different deck and nobody knows why —
          and it wears the same red plate as the marks that armed it, so the
          two halves of one gesture look like one gesture. */}
      {answering && (
        <div className="chat-answering">
          <span className="chat-answering__what">{t('board.answeringOne')}</span>
          <button
            type="button"
            className="chat-act"
            title={t('actions.cancel')}
            aria-label={t('actions.cancel')}
            onClick={() => setAnswering(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* The second half of a chef-shaped phrase. A list, never a text field:
          that is what keeps the fridge free of free text. */}
      {aiming ? (
        <div className="stack">
          <p className="muted">{t('board.whichChef')}</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {chefs.map((name) => (
              <button
                key={name}
                type="button"
                disabled={posting}
                onClick={() => onPost(aiming, name)}
              >
                {name}
              </button>
            ))}
            <button type="button" className="secondary" onClick={() => setAiming(null)}>
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <RollingPin phrases={phrases} disabled={posting} onPick={onPost} />
      )}
    </div>
  )
}
