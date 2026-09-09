import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChoiceList } from '../../components/ChoiceList'
import { useFilRougeLabel } from '../../lib/filRouge'
import { FilRougeDishes } from './FilRougeDishes'
import {
  filRougeTurnsAt,
  filRougeUpcoming,
  listFilRouge,
  type FilRougeCategory,
  type FilRougeOption,
  type FilRougeScope,
} from '../../lib/rpc'

// The order the categories are offered in, easiest first. The world is at the
// top because it is the one that rotates, and therefore the one worth coming
// back for; the letter is next because it needs no explanation at all.
const CATEGORIES: FilRougeCategory[] = ['COUNTRY', 'COLOUR', 'LETTER', 'TECHNIQUE', 'STAPLE', 'ERA']

/** Days and hours until the shelf turns over, in words rather than a ticking
 *  clock: nothing here changes in the next second, so a live timer would be
 *  movement for its own sake. */
function useCountdown(turnsAt: string | undefined) {
  const { t } = useTranslation()
  if (!turnsAt) return null
  const ms = new Date(turnsAt).getTime() - Date.now()
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(hours / 24)
  const time = days >= 1 ? t('filRouge.days', { count: days }) : t('filRouge.hours', { count: hours })
  return t('filRouge.turnsIn', { time })
}

export function FilRougePicker({
  category,
  code,
  scope,
  onChange,
}: {
  category: FilRougeCategory | null
  code: string | null
  scope: FilRougeScope
  onChange: (next: {
    category: FilRougeCategory | null
    code: string | null
    scope: FilRougeScope
  }) => void
}) {
  const { t } = useTranslation()
  const label = useFilRougeLabel()

  // Static for the week, so it is fetched once and shared by every screen that
  // asks. Five minutes is well inside the shortest interesting window.
  const { data: shelf } = useQuery({
    queryKey: ['fil-rouge', 'shelf'],
    queryFn: listFilRouge,
    staleTime: 5 * 60 * 1000,
  })
  const { data: turnsAt } = useQuery({
    queryKey: ['fil-rouge', 'turns-at'],
    queryFn: filRougeTurnsAt,
    staleTime: 5 * 60 * 1000,
  })
  const { data: next } = useQuery({
    queryKey: ['fil-rouge', 'upcoming'],
    queryFn: filRougeUpcoming,
    staleTime: 5 * 60 * 1000,
    // Only worth a request once a category is open, and only to answer the one
    // question a bad week raises: is it worth waiting?
    enabled: category !== null,
  })

  const countdown = useCountdown(turnsAt)

  const inCategory = useMemo(
    () => (shelf ?? []).filter((o) => o.category === category),
    [shelf, category],
  )

  // The world is read group by group: the group is what Crème opens, so it has
  // to be named for the offer to make sense. Everything else is a flat list.
  const groups = useMemo(() => {
    if (category !== 'COUNTRY') return []
    const by = new Map<string, FilRougeOption[]>()
    for (const o of inCategory) {
      if (!o.group_code) continue
      // Only groups this week actually put on the shelf: the other sixteen are
      // a scrolling atlas of things nobody can choose.
      if (!inCategory.some((x) => x.group_code === o.group_code && x.drawn)) continue
      const list = by.get(o.group_code) ?? []
      list.push(o)
      by.set(o.group_code, list)
    }
    // Sorted by micro-group code, which sorts by macro group first ('1-A'
    // before '2-B') — so the seven rows arrive in a stable order and the macro
    // heading below changes exactly once per macro group.
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [inCategory, category])

  const nextCountries = (next ?? []).filter((n) => n.category === 'COUNTRY')

  function pickCategory(value: string) {
    if (value === 'NONE') return onChange({ category: null, code: null, scope: 'SHARED' })
    onChange({ category: value as FilRougeCategory, code: null, scope })
  }

  return (
    <div className="stack">
      <ChoiceList
        name="fil-rouge-category"
        value={category ?? 'NONE'}
        onChange={pickCategory}
        options={[
          { value: 'NONE', label: t('filRouge.none'), hint: t('filRouge.noneHint') },
          ...CATEGORIES.map((c) => ({
            value: c,
            label: t(`filRouge.category.${c}`),
            hint: t(`filRouge.categoryHint.${c}`),
          })),
        ]}
      />

      {category && (
        <>
          {/* Who the thread binds. Asked before the value, because on a
              per-cook dinner there is no single value to choose. */}
          <ChoiceList
            name="fil-rouge-scope"
            value={scope}
            onChange={(v) => onChange({ category, code: null, scope: v as FilRougeScope })}
            options={(['SHARED', 'PER_COOK'] as FilRougeScope[]).map((s) => ({
              value: s,
              label: t(`filRouge.scope.${s}`),
              hint: t(`filRouge.scope.${s}Hint`),
            }))}
          />

          {countdown && <p className="muted">{countdown}</p>}

          {scope === 'SHARED' && category === 'COUNTRY' && (
            <div className="stack">
              {groups.map(([groupCode, options], i) => {
                const drawn = options.find((o) => o.drawn)
                const rest = options.filter((o) => !o.drawn)
                const macro = groupCode.split('-')[0]
                // The macro group is the staple the whole family is built on —
                // wheat, rice, maize — and it is a different fact from where
                // the micro group is. Printed once, above the first micro
                // group that belongs to it.
                const newMacro = i === 0 || groups[i - 1][0].split('-')[0] !== macro
                return (
                  <div key={groupCode} className="stack">
                    {newMacro && (
                      <p className="menucard__head">{t(`filRouge.macro.${macro}`)}</p>
                    )}
                    <p className="muted">{t(`filRouge.group.${groupCode}`)}</p>
                    <ChoiceList
                      name={`fil-rouge-${groupCode}`}
                      value={code ?? ''}
                      onChange={(v) => onChange({ category, code: v, scope })}
                      visibleRows={rest.length > 0 ? 6 : undefined}
                      options={[
                        ...(drawn
                          ? [{
                              value: drawn.code,
                              label: label(category, drawn.code),
                              tag: t('filRouge.drawn'),
                            }]
                          : []),
                        ...rest.map((o) => ({
                          value: o.code,
                          label: label(category, o.code),
                          locked: !o.offered,
                          lockedReason: t('filRouge.lockedHint'),
                        })),
                      ]}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {scope === 'SHARED' && category !== 'COUNTRY' && (
            <ChoiceList
              name="fil-rouge-value"
              value={code ?? ''}
              onChange={(v) => onChange({ category, code: v, scope })}
              visibleRows={inCategory.length > 8 ? 8 : undefined}
              options={inCategory.map((o) => ({
                value: o.code,
                label: label(category, o.code),
                tag: o.drawn ? t('filRouge.drawn') : undefined,
                locked: !o.offered,
                lockedReason: t('filRouge.lockedHint'),
              }))}
            />
          )}

          {/* What the choice actually means, for the one category where a
              host can pick something they have never cooked from. */}
          {scope === 'SHARED' && <FilRougeDishes category={category} code={code} />}

          {/* A hard week is answered by showing the next one rather than by
              widening this one. Sunday is three days away; the dinner is
              usually further off than that. */}
          {category === 'COUNTRY' && nextCountries.length > 0 && (
            <p className="muted">
              {t('filRouge.nextWeek', {
                items: nextCountries.map((n) => label('COUNTRY', n.code)).join(' · '),
              })}
            </p>
          )}
        </>
      )}
    </div>
  )
}
