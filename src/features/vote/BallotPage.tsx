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
import { useFilRougeLabel } from '../../lib/filRouge'
import { getFilRouge } from '../../lib/rpc'

function RankedRow({
  option,
  rank,
  originality,
  briefRespect,
  theme,
  threadLabel,
  onScoreChange,
}: {
  option: BallotOption
  rank: number
  originality: number | null
  briefRespect: number | null
  theme: number | null
  /** The thread this dish owed, already in words — absent when the dinner has
   *  none, which is what keeps the third dropdown off most ballots. */
  threadLabel: string | null
  onScoreChange: (kind: 'originality' | 'briefRespect' | 'theme', value: number | null) => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: option.brief_id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    // Dish above, scores below. Four things on one line meant the dish name —
    // the only part you are actually judging — was squeezed between a rank and
    // two dropdowns, and on a phone it wrapped to nothing.
    <div ref={setNodeRef} style={style} className="card ballotrow" {...attributes} {...listeners}>
      <div className="ballotrow__head">
        <strong className="ballotrow__rank">#{rank}</strong>
        <div className="ballotrow__dish">
          <div className="ballotrow__name">{option.dish_name}</div>
          <div className="muted">{t(`briefs.courseOption.${option.course}`)}</div>
          {/* Named on the row rather than once at the top: on a per-cook
              dinner every dish owed a different thread, so "did it honour it"
              cannot be answered without saying which. */}
          {threadLabel && <div className="muted">{threadLabel}</div>}
        </div>
      </div>

      <div className="ballotrow__scores">
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
      {threadLabel && (
        <select
          aria-label={t('vote.themeRespect')}
          value={theme ?? ''}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onScoreChange('theme', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('vote.themeRespect')}</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
      </div>
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
  const [scores, setScores] = useState<
    Record<string, { originality: number | null; briefRespect: number | null; theme: number | null }>
  >({})
  const filRougeLabel = useFilRougeLabel()
  // Asked once for the round: it decides whether the third dropdown exists at
  // all, and on a shared dinner it is also the answer for every dish.
  const { data: filRouge } = useQuery({
    queryKey: ['rounds', roundId, 'fil-rouge'],
    enabled: !!roundId,
    queryFn: () => getFilRouge(roundId as string),
    staleTime: 60 * 1000,
  })

  /** The thread a given dish owed, in words, or null when there is none to
   *  honour — which is what hides the third score rather than showing an
   *  unanswerable question. */
  function threadFor(option: BallotOption): string | null {
    if (!filRouge?.category) return null
    const code = filRouge.scope === 'SHARED' ? filRouge.code : option.fil_rouge_code
    if (!code) return null
    return t('filRouge.onTheMenu', { value: filRougeLabel(filRouge.category, code) })
  }
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
          theme_score: scores[briefId]?.theme ?? null,
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
                  theme={scores[id]?.theme ?? null}
                  threadLabel={threadFor(option)}
                  onScoreChange={(kind, value) =>
                    setScores((prev) => ({
                      ...prev,
                      [id]: {
                        originality: prev[id]?.originality ?? null,
                        briefRespect: prev[id]?.briefRespect ?? null,
                        theme: prev[id]?.theme ?? null,
                        [kind]: value,
                      },
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
