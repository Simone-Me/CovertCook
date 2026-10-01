import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  filRougeClash,
  FIL_ROUGE_FROZEN,
  getFilRouge,
  setFilRouge,
  type FilRougeCategory,
  type FilRougeScope,
} from '../../lib/rpc'
import { useFilRougeLabel } from '../../lib/filRouge'
import { FilRougePicker } from './FilRougePicker'
import { HostAction } from './HostAction'

/**
 * The dinner's theme — the thread every dish is cooked against — as a panel in
 * the pass, open for as long as it can move (until the roulette deals). It used
 * to live in the settings page; it belongs next to the other things the
 * Executive Chef is still deciding. A choice applies as it is made.
 */
export function FilRougePanel({ roundId }: { roundId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const filRougeLabel = useFilRougeLabel()
  const [error, setError] = useState<string | null>(null)
  const [clash, setClash] = useState<string[]>([])
  const [pending, setPending] = useState<{
    category: FilRougeCategory | null
    code: string | null
    scope: FilRougeScope
  } | null>(null)

  const { data: current } = useQuery({
    queryKey: ['rounds', roundId, 'fil-rouge'],
    queryFn: () => getFilRouge(roundId),
  })

  async function apply(next: { category: FilRougeCategory | null; code: string | null; scope: FilRougeScope }) {
    setPending(next)
    setError(null)
    try {
      await setFilRouge(roundId, next.category, next.scope === 'SHARED' ? next.code : null, next.scope)
      // Told, not refused (0069): the dinner is shared, so the one person who
      // can still change the thread is the one who hears about the collision.
      if (next.category) {
        const codes = next.scope === 'SHARED' && next.code ? [next.code] : []
        setClash(codes.length ? await filRougeClash(roundId, next.category, codes) : [])
      } else {
        setClash([])
      }
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === FIL_ROUGE_FROZEN ? t('filRouge.frozen') : raw || t('errors.generic'))
    }
  }

  const shown = pending ?? current
  const aside = shown?.category
    ? current?.sealed && !pending
      ? t('filRouge.compass')
      : shown.scope === 'PER_COOK' || !shown.code
        ? t(`filRouge.category.${shown.category}`)
        : filRougeLabel(shown.category, shown.code)
    : t('filRouge.none')

  return (
    <HostAction title={t('filRouge.label')} aside={aside}>
      <p className="muted">{t('filRouge.explain')}</p>
      {error && <div className="error">{error}</div>}
      <FilRougePicker
        category={shown?.category ?? null}
        code={shown?.code ?? null}
        scope={shown?.scope ?? 'SHARED'}
        onChange={(next) => void apply(next)}
      />
      {clash.length > 0 && (
        <p className="notice">
          {t('filRouge.clash', {
            items: clash
              .map((c) => t(`food.allergen.${c}`, { defaultValue: t(`food.diet.${c}`, { defaultValue: c }) }))
              .join(', '),
          })}
        </p>
      )}
    </HostAction>
  )
}
