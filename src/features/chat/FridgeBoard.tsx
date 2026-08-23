import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import {
  getBoard,
  getMessageTemplates,
  markBoardRead,
  postToBoard,
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

// Nothing here identifies anybody. The icon is drawn from the message id,
// which is random per row — so the same person gets a different one every
// time they speak, on purpose. An icon that stayed with a person would be a
// pseudonym you could follow all evening, which is exactly what the board
// has always refused to hand out (0031, 0033).
const FOODS = ['🥕', '🍅', '🧄', '🧅', '🥦', '🍆', '🌽', '🥑', '🍋', '🍇', '🍒', '🧀', '🥐', '🍄', '🌶️', '🥬', '🍐', '🥝']

function foodFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return FOODS[h % FOODS.length]
}

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

export function FridgeBoard({ roundId }: { roundId: string }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const locale = profile?.locale ?? 'en'

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

  const phrases = templates?.filter((tpl) => tpl.category === 'BOARD') ?? []

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
          {board?.map((m) => (
            <div key={m.message_id} className={`chat-bubble chat-bubble--food${m.is_mine ? ' mine' : ''}`}>
              <span className="chat-bubble__food" aria-hidden="true">
                {foodFor(m.message_id)}
              </span>
              <span className="chat-bubble__body">
                <span>{m.body}</span>
                <span className="row chat-bubble__foot">
                  {m.reported ? (
                    <span className="muted">{t('chat.reported')}</span>
                  ) : (
                    !m.is_mine && (
                      <button
                        type="button"
                        className="chef-remove"
                        title={t('chat.report')}
                        aria-label={t('chat.report')}
                        onClick={() => onReport(m.message_id)}
                      >
                        ⚑
                      </button>
                    )
                  )}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <RollingPin phrases={phrases} disabled={posting} onPick={onPost} />
    </div>
  )
}
