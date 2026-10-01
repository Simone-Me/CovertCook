import { useState } from 'react'
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

interface Setup {
  access: RoundAccess
  anonymity: RoundAnonymity
  requiresApproval: boolean
  seats: number | null
  recipes: number
}

/**
 * The dinner as the Executive Chef pictured it, still open in the pass while it
 * is a draft (0099). Creation only has to say what kind of evening this is;
 * the details are settled here, one panel each, with the current choice beside
 * the title. One Save for the whole group, because they are one decision about
 * the door and the table.
 */
export function DraftSetup({ roundId, initial }: { roundId: string; initial: Setup }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [now, setNow] = useState<Setup>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { data: pro } = useQuery({ queryKey: ['pro', 'status'], queryFn: myProStatus, staleTime: 60 * 1000 })
  const isPro = pro?.pro ?? false

  const changed = JSON.stringify(now) !== JSON.stringify(initial)
  const set = (patch: Partial<Setup>) => {
    setNow((cur) => ({ ...cur, ...patch }))
    setSaved(false)
  }

  async function onSave() {
    setError(null)
    try {
      await setDraftSetup(roundId, now)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
      setSaved(true)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === PRO_REQUIRED ? t('pro.needed') : raw || t('errors.generic'))
    }
  }

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

      <button type="button" onClick={onSave} disabled={!changed}>
        {t('actions.save')}
      </button>
      {saved && <p className="muted">{t('rounds.settings.themesSaved')}</p>}
    </>
  )
}
