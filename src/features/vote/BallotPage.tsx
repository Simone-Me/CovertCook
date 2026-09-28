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
  theme,
  threadLabel,
  onThemeChange,
}: {
  option: BallotOption
  rank: number
  theme: number | null
  /** The theme this dish owed, already in words — absent when the dinner has
   *  none, which is what keeps every extra score off most ballots. */
  threadLabel: string | null
  onThemeChange: (value: number) => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: option.brief_id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    // Dish above, its one score below. The six dots on the left are the
    // handle people already know from every list they have reordered: without
    // them a ballot of cards read as a list to read, not one to arrange.
    <div ref={setNodeRef} style={style} className="card ballotrow" {...attributes} {...listeners}>
      <div className="ballotrow__head">
        <span className="ballotrow__grip" aria-hidden="true">
          ⠿
        </span>
        <strong className="ballotrow__rank">#{rank}</strong>
        <div className="ballotrow__dish">
          <div className="ballotrow__name">{option.dish_name}</div>
          <div className="muted">{t(`briefs.courseOption.${option.course}`)}</div>
          {/* Named on the row rather than once at the top: on a per-cook
              dinner every dish owed a different theme, so "did it honour it"
              cannot be answered without saying which. */}
          {threadLabel && <div className="muted">{threadLabel}</div>}
        </div>
      </div>

      {threadLabel && <ThemeSlider value={theme} onChange={onThemeChange} />}
    </div>
  )
}

/**
 * ONE SCORE, AND ONLY WHEN THERE IS A THEME TO SCORE AGAINST.
 *
 * Originality and "followed the recipe" were two dropdowns on every row of
 * every ballot: two questions people answered at random or not at all. What a
 * table actually wants to argue about is the theme — who took "Mexico" or "the
 * colour green" somewhere nobody expected — so that is the one question, and
 * it is only asked when the dinner had one.
 *
 * A dot on a line rather than a menu of numbers: dragging it is a feeling, and
 * picking "4" from a list is a form. It starts grey and unset; nothing is sent
 * for a dish nobody touched.
 */
function ThemeSlider({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  const { t } = useTranslation()
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <div className="themeslider" onPointerDown={stop} onKeyDown={stop}>
      <label className="themeslider__label">
        {t('vote.themeScore')}
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          className={value === null ? 'themeslider__input is-unset' : 'themeslider__input'}
          value={value ?? 3}
          onChange={(e) => onChange(Number(e.target.value))}
          // Pressing the dot where it already sits fires no change; that
          // press still means "this one".
          onClick={(e) => value === null && onChange(Number(e.currentTarget.value))}
        />
      </label>
      <div className="themeslider__ends" aria-hidden="true">
        <span>{t('vote.themeScoreLow')}</span>
        <span>{t('vote.themeScoreHigh')}</span>
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
  const [scores, setScores] = useState<Record<string, number>>({})
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
          // Originality and recipe respect are no longer asked (the columns
          // stay for ballots cast before); the one score is the theme's.
          originality_score: null,
          brief_respect_score: null,
          theme_score: scores[briefId] ?? null,
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

      <p className="muted">{t(filRouge?.category ? 'vote.instructionsTheme' : 'vote.instructions')}</p>
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
                  theme={scores[id] ?? null}
                  threadLabel={threadFor(option)}
                  onThemeChange={(value) => setScores((prev) => ({ ...prev, [id]: value }))}
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
