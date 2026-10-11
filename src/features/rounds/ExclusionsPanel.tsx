import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { addExclusionPair, getExclusionPairs, listRoundPeople, removeExclusionPair } from '../../lib/rpc'
import { HostAction } from './HostAction'

/**
 * Who must not cook for whom, at the step that uses it.
 *
 * It lived in the settings, which is the one place nobody is when they are
 * about to spin the roulette — and the roulette is the only thing that reads
 * it. So it sits in the pass beside the menu, right before the spin; settings
 * keep a read-only copy (`ExclusionsList`) so a host can still check it later.
 *
 * Real names, host-only, from a function that never returns a pseudonym
 * (0053): naming the pair by pseudonym would force the host to work out who is
 * who — exactly what the anonymity withholds.
 */
export function ExclusionsPanel({ roundId }: { roundId: string }) {
  const { t } = useTranslation()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { people, exclusions, refetch, name } = useExclusions(roundId)

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!a || !b || a === b) return
    setError(null)
    try {
      await addExclusionPair(roundId, a, b)
      setA('')
      setB('')
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onRemove(id: string) {
    setError(null)
    try {
      await removeExclusionPair(id)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  return (
    <HostAction
      title={t('rounds.settings.exclusions')}
      aside={exclusions?.length ? String(exclusions.length) : t('rounds.settings.noExclusionsShort')}
    >
      <p className="muted" style={{ margin: 0 }}>
        {t('rounds.settings.exclusionsHelp')}
      </p>
      {error && <div className="error">{error}</div>}
      {exclusions?.map((ex) => (
        <div key={ex.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            {name(ex.member_a)} ↔ {name(ex.member_b)}
          </span>
          <button type="button" className="secondary" onClick={() => onRemove(ex.id)}>
            {t('actions.remove')}
          </button>
        </div>
      ))}
      <form onSubmit={onAdd} className="row">
        <select value={a} onChange={(e) => setA(e.target.value)} aria-label={t('rounds.settings.exclusions')}>
          <option value="">—</option>
          {people?.map((p) => (
            <option key={p.member_id} value={p.member_id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <select value={b} onChange={(e) => setB(e.target.value)} aria-label={t('rounds.settings.exclusions')}>
          <option value="">—</option>
          {people?.map((p) => (
            <option key={p.member_id} value={p.member_id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!a || !b || a === b}>
          {t('actions.add')}
        </button>
      </form>
    </HostAction>
  )
}

/** The same pairs, read-only, for the settings summary. */
export function ExclusionsList({ roundId }: { roundId: string }) {
  const { t } = useTranslation()
  const { exclusions, name } = useExclusions(roundId)
  if (!exclusions) return <>…</>
  if (exclusions.length === 0) return <>{t('rounds.settings.noExclusionsShort')}</>
  return (
    <>
      {exclusions.map((ex) => (
        <span key={ex.id} style={{ display: 'block' }}>
          {name(ex.member_a)} ↔ {name(ex.member_b)}
        </span>
      ))}
    </>
  )
}

function useExclusions(roundId: string) {
  const { data: people } = useQuery({
    queryKey: ['rounds', roundId, 'people'],
    queryFn: () => listRoundPeople(roundId),
  })
  const { data: exclusions, refetch } = useQuery({
    queryKey: ['rounds', roundId, 'exclusion-pairs'],
    queryFn: () => getExclusionPairs(roundId),
  })
  const name = (memberId: string) => people?.find((p) => p.member_id === memberId)?.display_name ?? '…'
  return { people, exclusions, refetch, name }
}
