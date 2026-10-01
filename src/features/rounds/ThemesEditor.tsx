import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listNameThemes,
  listTableThemes,
  myProStatus,
  setRoundThemes,
  THEME_LOCKED,
  type NameTheme,
  type TableTheme,
} from '../../lib/rpc'
import { HostAction } from './HostAction'
import { ThemePicker } from './ThemePicker'

/**
 * One of the dinner's two looks — the pseudonym list or the cloth — still the
 * host's to change while it is a draft (0098). A choice applies the moment it
 * is made, the way it does when a dinner is created: there is no Save to
 * forget. Two panels rather than one, because they are two decisions.
 */
export function ThemesEditor({
  roundId,
  kind,
  nameTheme,
  tableTheme,
  locale,
}: {
  roundId: string
  kind: 'name' | 'table'
  nameTheme: NameTheme
  tableTheme: TableTheme
  locale: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: nameThemes } = useQuery({
    queryKey: ['themes', 'name'],
    queryFn: listNameThemes,
    staleTime: 5 * 60 * 1000,
  })
  const { data: tableThemes } = useQuery({
    queryKey: ['themes', 'table'],
    queryFn: listTableThemes,
    staleTime: 5 * 60 * 1000,
  })
  const { data: pro } = useQuery({ queryKey: ['pro', 'status'], queryFn: myProStatus, staleTime: 60 * 1000 })
  const freeUntil = pro?.window_open ? pro.window_until : null

  async function apply(name: NameTheme, table: TableTheme) {
    setError(null)
    try {
      await setRoundThemes(roundId, name, table)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === THEME_LOCKED ? t('themes.locked') : raw || t('errors.generic'))
    }
  }

  const picking = kind === 'name'

  return (
    <HostAction
      title={t(picking ? 'rounds.group.pseudonym' : 'rounds.group.design')}
      aside={
        picking
          ? t(`rounds.nameTheme.${nameTheme}`, { defaultValue: nameTheme })
          : t(`rounds.tableTheme.${tableTheme}`, { defaultValue: tableTheme })
      }
    >
      {error && <div className="error">{error}</div>}
      {picking ? (
        <ThemePicker
          name="edit-name-theme"
          options={nameThemes}
          value={nameTheme}
          onChange={(code) => void apply(code as NameTheme, tableTheme)}
          labelKey="rounds.nameTheme"
          locale={locale}
          freeUntil={freeUntil}
        />
      ) : (
        <ThemePicker
          name="edit-table-theme"
          options={tableThemes}
          value={tableTheme}
          onChange={(code) => void apply(nameTheme, code as TableTheme)}
          labelKey="rounds.tableTheme"
          locale={locale}
          freeUntil={freeUntil}
        />
      )}
    </HostAction>
  )
}
