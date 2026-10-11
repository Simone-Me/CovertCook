import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BackToTable } from '../../components/BackToTable'
import { Fold } from '../../components/Fold'
import { useFilRougeLabel } from '../../lib/filRouge'
import {
  adminFilRougeWeeks,
  adminSetFilRougePick,
  isAppAdmin,
  listFilRouge,
  type AdminWeekRow,
  type FilRougeNotes,
  type FilRougeOption,
} from '../../lib/rpc'

// The languages a note can be written in. A missing one falls back to English,
// then to whatever exists (fil_rouge_editorial, 0092).
const NOTE_LOCALES = ['fr', 'en', 'it', 'es'] as const

/**
 * The pick of the week, planned ahead.
 *
 * One card per Sunday, one line per kind. A line is either WRITTEN (an admin
 * chose it, maybe with a note) or AUTO (the weekly draw filled it, 0107) — so
 * "what is missing" is simply the AUTO lines, counted on each card and at the
 * top. Saving writes one kind for one week; "back to auto" clears it.
 */
export function AdminWeekPage() {
  const { t } = useTranslation()
  const [count, setCount] = useState(8)

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ['is-app-admin'],
    queryFn: isAppAdmin,
  })
  const { data: rows, error } = useQuery({
    queryKey: ['admin', 'fil-rouge-weeks', count],
    enabled: admin === true,
    queryFn: () => adminFilRougeWeeks(count),
  })
  const { data: options } = useQuery({
    queryKey: ['fil-rouge', 'all'],
    enabled: admin === true,
    queryFn: listFilRouge,
    staleTime: 10 * 60 * 1000,
  })

  const weeks = useMemo(() => {
    const byWeek = new Map<number, AdminWeekRow[]>()
    for (const r of rows ?? []) byWeek.set(r.week, [...(byWeek.get(r.week) ?? []), r])
    return [...byWeek.entries()]
  }, [rows])

  if (adminLoading) return <p className="muted">…</p>
  if (!admin) return <Navigate to="/" replace />

  const missingTotal = (rows ?? []).filter((r) => !r.authored).length

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('admin.week.title')}</h1>
      <p className="muted">{t('admin.week.lead')}</p>
      {error && <div className="error">{error instanceof Error ? error.message : t('errors.generic')}</div>}
      {rows && (
        <p>
          <strong>
            {missingTotal === 0
              ? t('admin.week.allWritten', { count: weeks.length })
              : t('admin.week.missingTotal', { count: missingTotal, weeks: weeks.length })}
          </strong>
        </p>
      )}

      {weeks.map(([week, lines], i) => (
        <WeekCard key={week} lines={lines} options={options ?? []} isCurrent={i === 0} />
      ))}

      {count < 52 && (
        <button type="button" className="secondary" onClick={() => setCount((c) => Math.min(52, c + 4))}>
          {t('admin.week.more')}
        </button>
      )}
    </div>
  )
}

function WeekCard({
  lines,
  options,
  isCurrent,
}: {
  lines: AdminWeekRow[]
  options: FilRougeOption[]
  isCurrent: boolean
}) {
  const { t, i18n } = useTranslation()
  const missing = lines.filter((l) => !l.authored).length
  const date = new Date(`${lines[0].starts_on}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <Fold
      title={isCurrent ? t('admin.week.thisWeek', { date }) : t('admin.week.weekOf', { date })}
      aside={missing === 0 ? t('admin.week.complete') : t('admin.week.missing', { count: missing })}
      defaultOpen={isCurrent || missing > 0}
    >
      <div className="stack">
        {lines.map((line) => (
          <KindLine key={`${line.category}:${line.code}:${line.authored}`} line={line} options={options.filter((o) => o.category === line.category)} />
        ))}
      </div>
    </Fold>
  )
}

function KindLine({ line, options }: { line: AdminWeekRow; options: FilRougeOption[] }) {
  const { t } = useTranslation()
  const label = useFilRougeLabel()
  const queryClient = useQueryClient()
  const [code, setCode] = useState(line.code)
  const [notes, setNotes] = useState<FilRougeNotes>(line.notes ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const sorted = useMemo(
    () => [...options].sort((a, b) => label(a.category, a.code).localeCompare(label(b.category, b.code))),
    [options, label],
  )

  function setNote(locale: string, field: 'title' | 'body', value: string) {
    setSaved(false)
    setNotes((prev) => ({ ...prev, [locale]: { title: prev[locale]?.title ?? null, body: prev[locale]?.body ?? null, [field]: value } }))
  }

  async function save(nextCode: string | null) {
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      await adminSetFilRougePick(line.week, line.category, nextCode, nextCode ? notes : {})
      await queryClient.invalidateQueries({ queryKey: ['admin', 'fil-rouge-weeks'] })
      await queryClient.invalidateQueries({ queryKey: ['fil-rouge'] })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <div className="adminweek__row">
        <strong>{t(`filRouge.category.${line.category}`)}</strong>
        <select
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setSaved(false)
          }}
          aria-label={t(`filRouge.category.${line.category}`)}
        >
          {sorted.map((o) => (
            <option key={o.code} value={o.code}>
              {label(o.category, o.code)}
            </option>
          ))}
        </select>
        <span className={`adminweek__state ${line.authored ? 'is-written' : 'is-auto'}`}>
          {t(line.authored ? 'admin.week.written' : 'admin.week.auto')}
        </span>
      </div>

      <details>
        <summary className="muted">{t('admin.week.notes')}</summary>
        <div className="stack">
          {NOTE_LOCALES.map((loc) => (
            <div key={loc} className="stack" style={{ gap: 4 }}>
              <label className="muted">{loc.toUpperCase()}</label>
              <input
                placeholder={t('admin.week.noteTitle')}
                value={notes[loc]?.title ?? ''}
                onChange={(e) => setNote(loc, 'title', e.target.value)}
              />
              <textarea
                rows={2}
                placeholder={t('admin.week.noteBody')}
                value={notes[loc]?.body ?? ''}
                onChange={(e) => setNote(loc, 'body', e.target.value)}
              />
            </div>
          ))}
        </div>
      </details>

      {error && <div className="error">{error}</div>}
      <div className="row">
        <button type="button" disabled={busy} onClick={() => save(code)}>
          {t('admin.week.save')}
        </button>
        {line.authored && (
          <button type="button" className="secondary" disabled={busy} onClick={() => save(null)}>
            {t('admin.week.backToAuto')}
          </button>
        )}
        {saved && <span className="muted">{t('rounds.settings.saved')}</span>}
      </div>
    </div>
  )
}
