import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getBallotOptions, submitBallot, withdrawBallot, type BallotOption } from '../../lib/rpc'
import { BackToTable } from '../../components/BackToTable'

function RankedRow({
  option,
  rank,
  originality,
  briefRespect,
  onScoreChange,
}: {
  option: BallotOption
  rank: number
  originality: number | null
  briefRespect: number | null
  onScoreChange: (kind: 'originality' | 'briefRespect', value: number | null) => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: option.brief_id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="card row" {...attributes} {...listeners}>
      <strong style={{ width: 24 }}>#{rank}</strong>
      <div style={{ flex: 1 }}>
        <div>{option.dish_name}</div>
        <div className="muted">{t(`briefs.courseOption.${option.course}`)}</div>
      </div>
      <select
        aria-label={t('vote.originality')}
        value={originality ?? ''}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onScoreChange('originality', e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{t('vote.originality')}</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select
        aria-label={t('vote.briefRespect')}
        value={briefRespect ?? ''}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onScoreChange('briefRespect', e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{t('vote.briefRespect')}</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  )
}

export function BallotPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()

  const { data: options, isLoading } = useQuery({
    queryKey: ['rounds', roundId, 'ballot-options'],
    enabled: !!roundId,
    queryFn: () => getBallotOptions(roundId as string),
  })

  const [order, setOrder] = useState<string[]>([])
  const [scores, setScores] = useState<Record<string, { originality: number | null; briefRespect: number | null }>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (options) setOrder(options.map((o) => o.brief_id))
  }, [options])

  if (isLoading) return <p className="muted">…</p>

  const byId = new Map((options ?? []).map((o) => [o.brief_id, o]))

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id))
      const newIndex = prev.indexOf(String(over.id))
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  async function onSubmit() {
    if (!roundId) return
    setError(null)
    setBusy(true)
    try {
      await submitBallot(
        roundId,
        order.map((briefId, i) => ({
          brief_id: briefId,
          rank: i + 1,
          originality_score: scores[briefId]?.originality ?? null,
          brief_respect_score: scores[briefId]?.briefRespect ?? null,
        })),
      )
      setSubmitted(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      if (message.includes('already submitted')) setSubmitted(true)
      else setError(message)
    } finally {
      setBusy(false)
    }
  }

  // "Ballots are final" is the right rule at the moment the count is taken
  // and the wrong one for the twenty minutes before it: someone who ranked
  // six dishes on a phone and spotted a mistake immediately had no way back.
  // The deadline still closes the door — withdraw_ballot refuses once
  // voting_closes_at has passed (0024).
  async function onChange() {
    if (!roundId) return
    setError(null)
    setBusy(true)
    try {
      await withdrawBallot(roundId)
      setSubmitted(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <div className="stack sheet">
        <BackToTable />
        <h1>{t('vote.title')}</h1>
        <p className="muted">{t('vote.thanks')}</p>
        {error && <div className="error">{error}</div>}
        <button type="button" className="secondary" disabled={busy} onClick={onChange}>
          {t('vote.change')}
        </button>
      </div>
    )
  }

  if (options && options.length === 0) {
    return (
      <div className="stack sheet">
        <h1>{t('vote.title')}</h1>
        <p className="muted">{t('vote.nothingToRank')}</p>
      </div>
    )
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('vote.title')}</h1>

      {/* The menu first, the ballot second. You are being asked to judge a
          meal, and until now the only way to see what the meal WAS was to
          read the thing you drag rows around in. A card you can read top to
          bottom without touching anything separates "what was served" from
          "what I thought of it". */}
      <div className="menucard">
        <p className="menucard__head">{t('vote.theMenu')}</p>
        <ol className="menucard__list">
          {options?.map((o) => (
            <li key={o.brief_id} className="menucard__course">
              <span className="menucard__name">{o.dish_name}</span>
              <span className="menucard__course-kind">{t(`briefs.courseOption.${o.course}`)}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="muted">{t('vote.instructions')}</p>
      {error && <div className="error">{error}</div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="stack">
            {order.map((id, i) => {
              const option = byId.get(id)
              if (!option) return null
              return (
                <RankedRow
                  key={id}
                  option={option}
                  rank={i + 1}
                  originality={scores[id]?.originality ?? null}
                  briefRespect={scores[id]?.briefRespect ?? null}
                  onScoreChange={(kind, value) =>
                    setScores((prev) => ({
                      ...prev,
                      [id]: { originality: prev[id]?.originality ?? null, briefRespect: prev[id]?.briefRespect ?? null, [kind]: value },
                    }))
                  }
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      <button type="button" onClick={onSubmit} disabled={busy || order.length === 0}>
        {t('vote.submitBallot')}
      </button>
    </div>
  )
}
