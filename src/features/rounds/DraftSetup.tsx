import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  myProStatus,
  PRO_REQUIRED,
  setDraftSetup,
  type RoundAccess,
  type RoundAnonymity,
} from '../../lib/rpc'
import { ChoiceList } from '../../components/ChoiceList'
import { HostAction } from './HostAction'
import { DoorRules } from './DoorRules'

const ACCESS_ORDER: RoundAccess[] = ['CODE', 'INVITE', 'CODE_AND_INVITE']
const ANONYMITY_ORDER: RoundAnonymity[] = ['ANONYMOUS', 'SPY', 'OPEN']
const RECIPE_COUNTS = [1, 2, 3]

export interface Setup {
  access: RoundAccess
  anonymity: RoundAnonymity
  requiresApproval: boolean
  seats: number | null
  recipes: number
  guestsAllowed: boolean
}

/**
 * The dinner as the Executive Chef pictured it, still open in the pass while it
 * is a draft (0099, 0101). Every choice applies the moment it is made — the
 * way it does on the creation form — so there is no Save to forget. The seat
 * slider is the one control that fires continuously, so a change waits half a
 * second for the thumb to stop before it is sent.
 */
export function DraftSetup({ roundId, initial }: { roundId: string; initial: Setup }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [now, setNow] = useState<Setup>(initial)
  const [error, setError] = useState<string | null>(null)
  const sent = useRef(JSON.stringify(initial))

  const { data: pro } = useQuery({ queryKey: ['pro', 'status'], queryFn: myProStatus, staleTime: 60 * 1000 })
  const isPro = pro?.pro ?? false

  useEffect(() => {
    const wanted = JSON.stringify(now)
    if (wanted === sent.current) return
    const id = setTimeout(async () => {
      sent.current = wanted
      setError(null)
      try {
        await setDraftSetup(roundId, now)
        await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
      } catch (err) {
        const raw = err instanceof Error ? err.message : ''
        setError(raw === PRO_REQUIRED ? t('pro.needed') : raw || t('errors.generic'))
        // Put the controls back to what the server still holds.
        sent.current = JSON.stringify(initial)
        setNow(initial)
      }
    }, 500)
    return () => clearTimeout(id)
  }, [now, roundId, initial, queryClient, t])

  const set = (patch: Partial<Setup>) => setNow((cur) => ({ ...cur, ...patch }))

  return (
    <>
      {error && <div className="error">{error}</div>}

      <HostAction title={t('rounds.group.invitation')} aside={t(`rounds.access.${now.access}`)}>
        <ChoiceList
          name="draft-access"
          value={now.access}
          onChange={(v) => set({ access: v as RoundAccess })}
          options={ACCESS_ORDER.map((code) => ({
            value: code,
            label: t(`rounds.access.${code}`),
            hint: t(`rounds.access.${code}Hint`),
          }))}
        />
      </HostAction>

      <DoorRules
        inPass
        seats={now.seats}
        onSeats={(seats) => set({ seats })}
        requiresApproval={now.requiresApproval}
        onRequiresApproval={(requiresApproval) => set({ requiresApproval })}
      />

      <HostAction title={t('rounds.group.covert')} aside={t(`rounds.anonymity.${now.anonymity}`)}>
        <ChoiceList
          name="draft-anonymity"
          value={now.anonymity}
          onChange={(v) => set({ anonymity: v as RoundAnonymity })}
          options={ANONYMITY_ORDER.map((code) => ({
            value: code,
            label: t(`rounds.anonymity.${code}`),
            hint: t(`rounds.anonymity.${code}Hint`),
          }))}
        />
      </HostAction>

      <HostAction
        title={t('rounds.group.multiple')}
        aside={t('rounds.recipesPerBrief.count', { count: now.recipes })}
      >
        <ChoiceList
          name="draft-recipes"
          value={String(now.recipes)}
          onChange={(v) => set({ recipes: Number(v) })}
          options={RECIPE_COUNTS.map((n) => ({
            value: String(n),
            label: t('rounds.recipesPerBrief.count', { count: n }),
            hint: t(`rounds.recipesPerBrief.hint${n}`),
            locked: n > 1 && !isPro && n !== initial.recipes,
            lockedReason: t('pro.lockedHere'),
          }))}
        />
      </HostAction>

      {/* Whether everybody must cook. Said as its own setting so that a dinner
          with no guests is a decision and not an absence. */}
      <HostAction
        title={t('rounds.guest.setupTitle')}
        aside={t(now.guestsAllowed ? 'rounds.guest.allowed' : 'rounds.guest.notAllowed')}
      >
        <ChoiceList
          name="draft-guests"
          value={now.guestsAllowed ? 'YES' : 'NO'}
          onChange={(v) => set({ guestsAllowed: v === 'YES' })}
          options={(['NO', 'YES'] as const).map((code) => ({
            value: code,
            label: t(code === 'YES' ? 'rounds.guest.allowed' : 'rounds.guest.notAllowed'),
            hint: t(code === 'YES' ? 'rounds.guest.allowedHint' : 'rounds.guest.notAllowedHint'),
          }))}
        />
      </HostAction>
    </>
  )
}
