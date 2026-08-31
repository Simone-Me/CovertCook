import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound, useRoundMembers } from './hooks'
import {
  getChain,
  namesAreOpen,
  setPairing,
  spliceMember,
  SPLICE_REQUIRES_CONFIRMATION,
  type ChainLink,
} from '../../lib/rpc'
import { BackToTable } from '../../components/BackToTable'
import { ChainCircle } from './ChainCircle'
import { InlineConfirm } from '../../components/InlineConfirm'

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
  // Raised by the RPC, answered on the page: splice_member refuses the first
  // time when a dish would change hands, and this is that refusal made
  // readable instead of thrown into a browser dialog.
  const [spliceNeedsOk, setSpliceNeedsOk] = useState(false)

  if (roundLoading || !round) return <p className="muted">…</p>
  const isHost = round.host_id === profile?.id
  if (!isHost) return <Navigate to={`/rounds/${roundId}`} replace />

  // This page is host-only and get_chain returns real names to the host
  // unconditionally — the reveal button above is the gate. What decides
  // whether they are *printed* is the dinner's own rule (0073): on a SPY or
  // OPEN round the host is entitled to them, so a ring of pseudonyms would be
  // a puzzle whose answer they already hold.
  const realNames = namesAreOpen(round, isHost)
  const nameOf = (m: { display_name: string | null; secret_name: string | null }) =>
    (realNames ? m.display_name : null) ?? m.secret_name

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
        setSpliceNeedsOk(true)
      } else {
        setError(message)
      }
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
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

              {/* The ring first, because it is the thing that is true: every
                  arrow points at the person that chef cooks for, and the fact
                  that it closes is visible rather than asserted at the bottom
                  of a list. */}
              <ChainCircle cycle={cycle} realNames={realNames} />

              {/* The same edges written out, kept because a name is easier to
                  copy from a line than from a diagram, and because a screen
                  reader gets a list rather than a picture. */}
              <ol className="chainring__pairs">
                {cycle.map((link) => (
                  <li key={link.sender_member_id}>
                    <span className="badge">
                      {(realNames ? link.sender_display_name : null) ?? link.sender_secret_name}
                    </span>
                    <span aria-hidden="true"> → </span>
                    <span className="badge">
                      {(realNames ? link.cook_display_name : null) ?? link.cook_secret_name}
                    </span>
                  </li>
                ))}
              </ol>
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
                    {nameOf(m)}
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
                    {nameOf(m)}
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
                      {nameOf(m)}
                    </option>
                  ))}
                </select>
                {spliceNeedsOk ? (
                  <InlineConfirm
                    title={t('chain.applySplice')}
                    onConfirm={() => {
                      setSpliceNeedsOk(false)
                      onSplice(true)
                    }}
                    onCancel={() => setSpliceNeedsOk(false)}
                  >
                    <p className="confirmbox__why">{t('chain.spliceConfirm')}</p>
                  </InlineConfirm>
                ) : (
                  <button type="button" onClick={() => onSplice(false)} disabled={!spliceMemberId}>
                    {t('chain.applySplice')}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
