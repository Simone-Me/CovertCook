import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChatThread } from '../chat/ChatThread'
import { acknowledgeBrief, getMessageTemplates, getMyBrief, sendMessage } from '../../lib/rpc'
import { useAuth } from '../../lib/auth'
import { BackToTable } from '../../components/BackToTable'

export function CookViewPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()
  const locale = profile?.locale ?? 'en'

  const { data: brief, isLoading } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief'],
    enabled: !!roundId,
    queryFn: () => getMyBrief(roundId as string),
  })
  const { data: templates } = useQuery({
    queryKey: ['message-templates', locale],
    queryFn: () => getMessageTemplates(locale),
  })
  const [cannotCookSent, setCannotCookSent] = useState(false)
  const [acked, setAcked] = useState(false)
  const [acking, setAcking] = useState(false)
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

  async function onCannotCook() {
    if (!brief) return
    const template = templates?.find((tpl) => tpl.category === 'CANNOT_COOK')
    if (!template) return
    try {
      await sendMessage({ pairingId: brief.pairing_id, templateId: template.id, slotValue: null })
      setCannotCookSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  if (isLoading) return <p className="muted">…</p>

  if (!brief) {
    return <p className="muted">{t('briefs.noBriefYet')}</p>
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{brief.dish_name}</h1>
      <span className="badge">{t(`briefs.courseOption.${brief.course}`)}</span>
      {error && <div className="error">{error}</div>}

      <div className="card stack">
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
      </div>

      {/* Two opposite answers, and until now only the unhappy one existed:
          a cook could raise CANNOT_COOK or say nothing at all, so a sender
          who wrote a recipe never learned whether it landed. */}
      <div className="row">
        {brief.acknowledged || acked ? (
          <p className="muted">{t('briefs.acknowledged')}</p>
        ) : (
          <button type="button" disabled={acking} onClick={onAcknowledge}>
            {t('briefs.acknowledge')}
          </button>
        )}
        {!cannotCookSent ? (
          <button type="button" className="secondary" onClick={onCannotCook}>
            {t('briefs.cannotCook')}
          </button>
        ) : (
          <p className="muted">{t('briefs.cannotCookSent')}</p>
        )}
      </div>

      <h2>{t('chat.title')}</h2>
      <ChatThread pairingId={brief.pairing_id} />
    </div>
  )
}
