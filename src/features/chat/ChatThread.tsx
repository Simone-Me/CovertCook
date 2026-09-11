import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import {
  getMessageTemplates,
  getThread,
  reportMessage,
  markThreadRead,
  sendMessage,
  type MessageCategory,
  type MessageTemplate,
} from '../../lib/rpc'

// Shared by the Brief editor (Sender <-> Cook) and Cook view (Cook <->
// Sender) pages, and by Results (both threads, now unmasked) — one
// pairing_id is always exactly one conversation. Canned-template-only by
// design (README §"Anonymity is layered"): no free text, so writing style
// can't out someone before the reveal.
export function ChatThread({ pairingId, roundId }: { pairingId: string; roundId?: string }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const locale = profile?.locale ?? 'en'

  const [category, setCategory] = useState<MessageCategory | ''>('')
  const [templateId, setTemplateId] = useState('')
  const [slotValue, setSlotValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const { data: templates } = useQuery({
    queryKey: ['message-templates', locale],
    queryFn: () => getMessageTemplates(locale),
  })

  const { data: thread } = useQuery({
    queryKey: ['thread', pairingId],
    queryFn: () => getThread(pairingId),
    refetchInterval: 15000,
  })

  // Clear the unread badge by opening the thread, not on a timer — a
  // badge that fades by itself stops meaning anything (0022).
  useEffect(() => {
    markThreadRead(pairingId).catch(() => {})
  }, [pairingId, thread?.length])

  // BOARD phrases belong to the whole table and are posted through
  // post_to_board, so they must not appear in a private thread's picker.
  const categories = Array.from(
    new Set(templates?.filter((tpl) => tpl.category !== 'BOARD').map((tpl) => tpl.category) ?? []),
  )
  const templatesInCategory = templates?.filter((tpl) => tpl.category === category) ?? []
  const selectedTemplate = templates?.find((tpl) => tpl.id === templateId)

  function renderBody(tpl: Pick<MessageTemplate, 'body'>, value: string | null) {
    return value ? tpl.body.replace(/\{[^}]+\}/, value) : tpl.body
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!templateId) return
    if (selectedTemplate?.slot_type !== 'NONE' && !slotValue.trim()) {
      setError(t('chat.slotValueRequired'))
      return
    }
    setError(null)
    setSending(true)
    try {
      await sendMessage({
        pairingId,
        templateId,
        slotValue: selectedTemplate?.slot_type !== 'NONE' ? slotValue.trim() : null,
      })
      setCategory('')
      setTemplateId('')
      setSlotValue('')
      await queryClient.invalidateQueries({ queryKey: ['thread', pairingId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSending(false)
    }
  }

  async function onReport(messageId: string) {
    // The round travels with the report so the host can be told there is
    // something waiting (0059). Optional, because a thread rendered without it
    // still reports perfectly well — it just leaves the alert to be found.
    await reportMessage(messageId, roundId)
    queryClient.invalidateQueries({ queryKey: ['thread', pairingId] })
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      {/* THE CONVERSATION, WRITTEN AS A MENU.
          Two columns of pale bubbles inside an already-folded panel was the
          least readable thing in the app: alternating alignment made every
          line start in a different place, the bubbles fought the paper they
          were laid on, and the only thing a reader wanted — who said what, in
          order — was the thing it hid. The menu card is the shape this app
          already uses when a list has to be read at a glance, and it is the
          shape the Executive Chef reads their courses in. So the thread is one
          column of ruled lines: the speaker in small caps, what they said
          beside it, the day at the end. Yours is marked in the margin rather
          than moved to the other side of the page. */}
      <div className="menucard menucard--thread">
        <p className="menucard__head">{t('chat.title')}</p>

        {thread?.length === 0 && <p className="muted">{t('chat.empty')}</p>}

        <ol className="menucard__list">
          {thread?.map((m) => (
            <li key={m.message_id} className="menucard__row">
              <div className={`menucard__course thread-line${m.is_mine ? ' is-mine' : ''}`}>
                <span className="menucard__name">
                  <span className="thread-line__who">
                    {m.is_mine
                      ? t('chat.you')
                      : (m.other_party_display_name ?? m.other_party_secret_name ?? '')}
                  </span>
                  <span className="thread-line__said">{renderBody(m, m.slot_value)}</span>
                </span>

                {/* Month and day, nothing else. A dinner is planned over days,
                    not across years, and the year was the widest thing on the
                    line while being the one part nobody needed. */}
                <span className="thread-line__day">{m.created_day.slice(5)}</span>

                {!m.is_mine && !m.reported && (
                  <button
                    type="button"
                    className="chat-act"
                    title={t('chat.report')}
                    aria-label={t('chat.report')}
                    onClick={() => onReport(m.message_id)}
                  >
                    ⚑
                  </button>
                )}
                {m.reported && <span className="muted thread-line__day">{t('chat.reported')}</span>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={onSend} className="stack">
        <div>
          <label htmlFor="chat-category">{t('chat.categoryLabel')}</label>
          <select
            id="chat-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as MessageCategory)
              setTemplateId('')
            }}
          >
            <option value="">{t('chat.pickCategory')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {t(`chat.category.${c}`)}
              </option>
            ))}
          </select>
        </div>

        {category && (
          <div>
            <label htmlFor="chat-template">{t('chat.message')}</label>
            <select id="chat-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">{t('chat.pickMessage')}</option>
              {templatesInCategory.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.body}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedTemplate && selectedTemplate.slot_type !== 'NONE' && (
          <div>
            <label htmlFor="chat-slot-value">{t('chat.slotValue')}</label>
            <input id="chat-slot-value" value={slotValue} onChange={(e) => setSlotValue(e.target.value)} />
          </div>
        )}

        {templateId && (
          <button type="submit" disabled={sending}>
            {t('chat.send')}
          </button>
        )}
      </form>
    </div>
  )
}
