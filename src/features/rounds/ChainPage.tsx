import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound, useRoundMembers } from './hooks'
import { getChain, setPairing, spliceMember, SPLICE_REQUIRES_CONFIRMATION, type ChainLink } from '../../lib/rpc'

// Walks the sender->cook edges into cycle order (get_chain returns rows
// ordered by lap + sender secret name, not by chain position) so the grid
// can render "who's cooking for whom, in order" instead of an alphabetical
// jumble the host would have to trace by hand.
//
// generate_assignment always produces a single cycle, but set_pairing's
// swap is a generic 2-opt edge exchange, which — like any 2-opt move on a
// single cycle — splits it into two disjoint cycles unless the host swaps
// again across the resulting pair to re-merge them. So this must return
// *every* cycle, not just the one reachable from links[0], or a manual
// edit could silently drop members from the view entirely.
function walkCycles(links: ChainLink[]): ChainLink[][] {
  const bySender = new Map(links.map((l) => [l.sender_member_id, l]))
  const visited = new Set<string>()
  const cycles: ChainLink[][] = []

  for (const start of links) {
    if (visited.has(start.sender_member_id)) continue
    const cycle: ChainLink[] = []
    let current = start
    while (!visited.has(current.sender_member_id)) {
      visited.add(current.sender_member_id)
      cycle.push(current)
      const next = bySender.get(current.cook_member_id)
      if (!next) break
      current = next
    }
    cycles.push(cycle)
  }
  return cycles
}

export function ChainPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: round, isLoading: roundLoading } = useRound(roundId)
  const { data: members } = useRoundMembers(roundId)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: chain, isLoading: chainLoading } = useQuery({
    queryKey: ['rounds', roundId, 'chain'],
    enabled: !!roundId && revealed,
    queryFn: () => getChain(roundId as string),
  })

  const [swapSenderId, setSwapSenderId] = useState('')
  const [swapCookId, setSwapCookId] = useState('')
  const [spliceMemberId, setSpliceMemberId] = useState('')

  if (roundLoading || !round) return <p className="muted">…</p>
  const isHost = round.host_id === profile?.id
  if (!isHost) return <Navigate to={`/rounds/${roundId}`} replace />

  const activeMembers = members?.filter((m) => m.status === 'ACTIVE' && m.approved) ?? []
  const inChain = new Set(chain?.flatMap((l) => [l.sender_member_id, l.cook_member_id]) ?? [])
  const notInChain = activeMembers.filter((m) => !inChain.has(m.id))
  const cycles = chain ? walkCycles(chain) : []

  async function onSwap(e: React.FormEvent) {
    e.preventDefault()
    if (!roundId || !swapSenderId || !swapCookId) return
    setError(null)
    try {
      await setPairing(roundId, swapSenderId, swapCookId)
      setSwapSenderId('')
      setSwapCookId('')
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'chain'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onSplice(confirmDishChange = false) {
    if (!roundId || !spliceMemberId) return
    setError(null)
    try {
      await spliceMember(roundId, spliceMemberId, confirmDishChange)
      setSpliceMemberId('')
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'chain'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      if (message === SPLICE_REQUIRES_CONFIRMATION) {
        if (window.confirm(t('chain.spliceConfirm'))) await onSplice(true)
      } else {
        setError(message)
      }
    }
  }

  return (
    <div className="stack">
      <h1>{t('chain.title')}</h1>
      {error && <div className="error">{error}</div>}

      {!revealed ? (
        <div className="card stack">
          <p className="muted">{t('chain.spoilerWarning')}</p>
          <button type="button" onClick={() => setRevealed(true)}>
            {t('chain.reveal')}
          </button>
        </div>
      ) : chainLoading ? (
        <p className="muted">…</p>
      ) : (
        <div className="stack">
          {cycles.length > 1 && <p className="muted">{t('chain.multipleCycles', { count: cycles.length })}</p>}
          {cycles.map((cycle, ci) => (
            <div key={cycle[0]?.sender_member_id ?? ci} className="stack">
              {cycles.length > 1 && <h2>{t('chain.cycleTitle', { index: ci + 1 })}</h2>}
              {cycle.map((link, i) => (
                <div key={link.sender_member_id} className="row" style={{ flexWrap: 'wrap' }}>
                  <span className="badge">{link.sender_secret_name}</span>
                  <span>→</span>
                  <span className="badge">{link.cook_secret_name}</span>
                  {i === cycle.length - 1 && (
                    <span className="muted">{t('chain.loopsBackTo', { name: cycle[0]?.sender_secret_name })}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {revealed && (
        <>
          <h2>{t('chain.swapTitle')}</h2>
          <form onSubmit={onSwap} className="stack card">
            <div>
              <label htmlFor="swap-sender">{t('chain.sender')}</label>
              <select id="swap-sender" value={swapSenderId} onChange={(e) => setSwapSenderId(e.target.value)}>
                <option value="">—</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.secret_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="swap-cook">{t('chain.newCook')}</label>
              <select id="swap-cook" value={swapCookId} onChange={(e) => setSwapCookId(e.target.value)}>
                <option value="">—</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.secret_name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={!swapSenderId || !swapCookId}>
              {t('chain.applySwap')}
            </button>
          </form>

          {notInChain.length > 0 && (
            <>
              <h2>{t('chain.spliceTitle')}</h2>
              <div className="stack card">
                <select value={spliceMemberId} onChange={(e) => setSpliceMemberId(e.target.value)}>
                  <option value="">—</option>
                  {notInChain.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.secret_name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => onSplice(false)} disabled={!spliceMemberId}>
                  {t('chain.applySplice')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
