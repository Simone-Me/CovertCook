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
import { Fold } from '../../components/Fold'
import { ThemePicker } from './ThemePicker'

/**
 * The dinner's two looks, still the host's to change while it is a draft.
 * Offered only in DRAFT (0098): once the door opens, guests have been dealt
 * names from the list and the cloth is what they have already seen.
 */
export function ThemesEditor({
  roundId,
  nameTheme,
  tableTheme,
  locale,
}: {
  roundId: string
  nameTheme: NameTheme
  tableTheme: TableTheme
  locale: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState<NameTheme>(nameTheme)
  const [table, setTable] = useState<TableTheme>(tableTheme)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

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

  async function onSave() {
    setError(null)
    setSaved(false)
    try {
      await setRoundThemes(roundId, name, table)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
      setSaved(true)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === THEME_LOCKED ? t('themes.locked') : raw || t('errors.generic'))
    }
  }

  return (
    <Fold title={t('rounds.group.theme')}>
      <div className="stack">
        <p className="muted">{t('rounds.group.themeHint')}</p>
        {error && <div className="error">{error}</div>}
        <ThemePicker
          name="edit-name-theme"
          options={nameThemes}
          value={name}
          onChange={(code) => setName(code as NameTheme)}
          labelKey="rounds.nameTheme"
          locale={locale}
          freeUntil={freeUntil}
        />
        <ThemePicker
          name="edit-table-theme"
          options={tableThemes}
          value={table}
          onChange={(code) => setTable(code as TableTheme)}
          labelKey="rounds.tableTheme"
          locale={locale}
          freeUntil={freeUntil}
        />
        <button type="button" onClick={onSave} disabled={name === nameTheme && table === tableTheme}>
          {t('actions.save')}
        </button>
        {saved && <p className="muted">{t('rounds.settings.themesSaved')}</p>}
      </div>
    </Fold>
  )
}
