import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ChoiceList } from '../../components/ChoiceList'
import { MENU_VISIBILITIES, setMenuVisibility, type MenuVisibility } from '../../lib/rpc'
import { HostAction } from './HostAction'

/**
 * Who reads the dish names while the recipes are being written — asked in the
 * pass, during the steps where recipes are actually being prepared, rather
 * than in a settings page nobody opens mid-dinner. Reversible until the
 * dinner itself: turning it on reveals names that are public at the end of
 * the evening anyway.
 */
export function MenuVisibilityPanel({ roundId, value }: { roundId: string; value: MenuVisibility }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  return (
    <HostAction title={t('rounds.sharedMenu.label')} aside={t(`rounds.sharedMenu.${value}`)}>
      {error && <div className="error">{error}</div>}
      <ChoiceList
        name="menu-visibility"
        value={value}
        onChange={async (v: string) => {
          setError(null)
          try {
            await setMenuVisibility(roundId, v as MenuVisibility)
            await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
          } catch (err) {
            setError(err instanceof Error ? err.message : t('errors.generic'))
          }
        }}
        options={MENU_VISIBILITIES.map((v) => ({
          value: v,
          label: t(`rounds.sharedMenu.${v}`),
          hint: t(`rounds.sharedMenu.${v}Hint`),
        }))}
      />
    </HostAction>
  )
}
