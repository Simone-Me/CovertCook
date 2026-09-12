import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Fold } from '../../components/Fold'
import { ChoiceList } from '../../components/ChoiceList'
import { countryName, useFilRougeLabel, FIL_ROUGE_MARK, HARD_LETTERS } from '../../lib/filRouge'
import { FilRougeDishes } from './FilRougeDishes'
import {
  filRougeTurnsAt,
  filRougeUpcoming,
  listFilRouge,
  FIL_ROUGE_SEALED,
  type FilRougeCategory,
  type FilRougeOption,
  type FilRougeScope,
} from '../../lib/rpc'

// The order the categories are offered in, easiest first. The world is at the
// top because it is the one that rotates, and therefore the one worth coming
// back for; the letter is next because it needs no explanation at all.
const CATEGORIES: FilRougeCategory[] = ['COUNTRY', 'COLOUR', 'LETTER', 'TECHNIQUE', 'STAPLE', 'ERA']

/** What the top of the picker asks, before anything else: nothing, one for the
 *  table, or one each. */
type Rule = 'NONE' | FilRougeScope

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

/**
 * Choosing what a whole dinner cooks against.
 *
 * THE SHAPE, AND WHY IT CHANGED. This was one flat list of six categories,
 * then the scope, then — for the world — twenty-three regions stacked one
 * under the other, every one of them expanded, several hundred rows deep. It
 * was honest and it was unusable: you could not see the six kinds at once
 * because the first of them was three screens tall.
 *
 * So it is now, in order:
 *
 *   1. WHO IT APPLIES TO, first, because it is the only question whose answer
 *      changes what the rest of the picker is for. One for the table means
 *      choosing a value; one each means choosing only a KIND, because the
 *      roulette deals the values later and there is nothing to pick.
 *   2. SIX FOLDS, one per kind, closed. Opening one shows its own choices in
 *      place, above the next kind — so the list of kinds is never more than a
 *      screen, whichever one is open.
 *   3. INSIDE EACH FOLD, the shape the values actually have: the world is an
 *      atlas you walk down or a name you type; colours, ways, ingredients and
 *      times are grids of marks; the letters are the alphabet, big.
 *
 * THE COMPASS IS NOT A SHORTCUT. It draws a country ON THE SERVER and nobody
 * — the host included — is told which until the dinner is dealt (0089). A
 * dinner whose host is as surprised as the table is a different evening, and
 * it is the only way this picker can offer one.
 */
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
  const { t, i18n } = useTranslation()
  const label = useFilRougeLabel()
  const [query, setQuery] = useState('')
  // Which part of the world is open. One at a time on purpose: the atlas is a
  // path down, not twenty-three lists side by side.
  const [macro, setMacro] = useState<string | null>(null)
  const [group, setGroup] = useState<string | null>(null)

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
    // Only worth a request once a kind is chosen, and only to answer the one
    // question a bad week raises: is it worth waiting?
    enabled: category !== null,
  })

  const countdown = useCountdown(turnsAt)

  // THE RULE IS HELD HERE, NOT DERIVED FROM THE CATEGORY, and that was a real
  // bug rather than a tidiness question: derived, "no thread" meant "no kind
  // chosen", so pressing "the same for everybody" on a fresh form set a scope
  // on a null category, the derivation read null again, and the radio sprang
  // back to "no thread" with nothing opening underneath it. Answering the
  // first question has to be possible before answering the second.
  const [rule, setRule] = useState<Rule>(category === null ? 'NONE' : scope)

  const byCategory = useMemo(() => {
    const by = new Map<FilRougeCategory, FilRougeOption[]>()
    for (const o of shelf ?? []) {
      const list = by.get(o.category) ?? []
      list.push(o)
      by.set(o.category, list)
    }
    return by
  }, [shelf])

  // Memoised rather than derived inline: the two passes below depend on it,
  // and a fresh empty array every render would rebuild the whole atlas on
  // every keystroke in the search box.
  const countries = useMemo(() => byCategory.get('COUNTRY') ?? [], [byCategory])

  // The world, as it is actually shaped: seven staples, twenty-three regions,
  // and the countries under them. Built once rather than filtered three times
  // on every keystroke.
  const atlas = useMemo(() => {
    const by = new Map<string, Map<string, FilRougeOption[]>>()
    for (const o of countries) {
      if (!o.macro_code || !o.group_code) continue
      const regions = by.get(o.macro_code) ?? new Map<string, FilRougeOption[]>()
      const list = regions.get(o.group_code) ?? []
      list.push(o)
      regions.set(o.group_code, list)
      by.set(o.macro_code, regions)
    }
    return by
  }, [countries])

  // Typing searches the whole world, not the open region: somebody who knows
  // they want Peru should not have to know which staple Peru is built on.
  const found = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(i18n.language)
    if (q.length < 1) return []
    return countries
      .map((o) => ({ o, name: countryName(o.code, i18n.language) }))
      .filter(({ name }) => name.toLocaleLowerCase(i18n.language).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
      .slice(0, 40)
  }, [countries, query, i18n.language])

  const nextCountries = (next ?? []).filter((n) => n.category === 'COUNTRY')

  function pickRule(value: string) {
    setRule(value as Rule)
    if (value === 'NONE') return onChange({ category: null, code: null, scope: 'SHARED' })
    // The kind survives a change of rule; the value cannot, because on a
    // per-cook dinner there is no single value to hold, and a shared one that
    // kept a value dealt per cook would be a value nobody chose.
    onChange({ category, code: null, scope: value as FilRougeScope })
  }

  function pick(next: FilRougeCategory, value: string | null) {
    const scopeNow: FilRougeScope = rule === 'NONE' ? 'SHARED' : rule
    if (rule === 'NONE') setRule('SHARED')
    onChange({ category: next, code: value, scope: scopeNow })
  }

  /** One value, as a tile in a grid: its mark, its name, and whether this
   *  account may take it. */
  function Tile({ option, kind }: { option: FilRougeOption; kind: FilRougeCategory }) {
    const chosen = category === kind && code === option.code
    const locked = !option.offered
    return (
      <button
        type="button"
        className={`frtile${chosen ? ' is-chosen' : ''}${locked ? ' is-locked' : ''}`}
        aria-pressed={chosen}
        disabled={locked}
        title={locked ? t('filRouge.lockedHint') : undefined}
        onClick={() => pick(kind, option.code)}
      >
        <span className="frtile__mark" aria-hidden="true">
          {FIL_ROUGE_MARK[option.code] ?? '•'}
        </span>
        <span className="frtile__name">{label(kind, option.code)}</span>
        {option.drawn && <span className="frtile__tag">{t('filRouge.drawn')}</span>}
      </button>
    )
  }

  /** What a fold shows when the dinner is dealing one thread each: there is no
   *  value to choose, so the only thing to say is "this kind" — and the pool
   *  the roulette will deal from is this week's shelf. */
  function PerCook({ kind }: { kind: FilRougeCategory }) {
    const chosen = category === kind
    return (
      <div className="stack">
        <p className="muted">{t('filRouge.scope.PER_COOKHint')}</p>
        <button
          type="button"
          className={chosen ? '' : 'secondary'}
          aria-pressed={chosen}
          onClick={() => pick(kind, null)}
        >
          {t(chosen ? 'filRouge.kindChosen' : 'filRouge.useThisKind')}
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      {/* 1. WHO IT APPLIES TO. First, because it decides what everything below
             is for: a value, or only a kind. */}
      <ChoiceList
        name="fil-rouge-rule"
        value={rule}
        onChange={pickRule}
        options={[
          { value: 'NONE', label: t('filRouge.none'), hint: t('filRouge.noneHint') },
          { value: 'SHARED', label: t('filRouge.scope.SHARED'), hint: t('filRouge.scope.SHAREDHint') },
          {
            value: 'PER_COOK',
            label: t('filRouge.scope.PER_COOK'),
            hint: t('filRouge.scope.PER_COOKHint'),
          },
        ]}
      />

      {rule !== 'NONE' && (
        <>
          {countdown && <p className="muted">{countdown}</p>}

          {/* 2. SIX FOLDS, closed, one per kind. The chosen one carries its
                 answer on the closed row, so the whole decision is readable
                 without opening anything. */}
          {CATEGORIES.map((kind) => (
            <Fold
              key={kind}
              title={t(`filRouge.category.${kind}`)}
              hint={t(`filRouge.categoryHint.${kind}`)}
              aside={
                category !== kind
                  ? undefined
                  : rule === 'PER_COOK'
                    ? t('filRouge.oneEach')
                    : code
                      ? label(kind, code)
                      : t('filRouge.pickOne')
              }
            >
              {rule === 'PER_COOK' ? (
                <PerCook kind={kind} />
              ) : kind === 'COUNTRY' ? (
                <div className="stack">
                  {/* The compass, and the search, on one line: the two ways
                      into the world that are not walking down through it. */}
                  <div className="row atlas__top">
                    <input
                      type="search"
                      value={query}
                      placeholder={t('filRouge.searchCountry')}
                      aria-label={t('filRouge.searchCountry')}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className="atlas__compass"
                      title={t('filRouge.compass')}
                      aria-label={t('filRouge.compass')}
                      onClick={() => {
                        setQuery('')
                        pick('COUNTRY', FIL_ROUGE_SEALED)
                      }}
                    >
                      🧭
                    </button>
                  </div>

                  {category === 'COUNTRY' && code === FIL_ROUGE_SEALED && (
                    <p className="notice">{t('filRouge.sealedChosen')}</p>
                  )}

                  {query.trim() ? (
                    <div className="frgrid frgrid--wide">
                      {found.map(({ o, name }) => (
                        <button
                          key={o.code}
                          type="button"
                          className={`frtile${code === o.code ? ' is-chosen' : ''}${
                            o.offered ? '' : ' is-locked'
                          }`}
                          disabled={!o.offered}
                          aria-pressed={code === o.code}
                          title={o.offered ? undefined : t('filRouge.lockedHint')}
                          onClick={() => pick('COUNTRY', o.code)}
                        >
                          <span className="frtile__name">{name}</span>
                          {o.drawn && <span className="frtile__tag">{t('filRouge.drawn')}</span>}
                        </button>
                      ))}
                      {found.length === 0 && <p className="muted">{t('filRouge.noCountry')}</p>}
                    </div>
                  ) : (
                    /* THE ATLAS, WALKED DOWN. Seven staples, then the regions
                       built on one of them, then the countries in one region —
                       each list opening in the place the one above it left,
                       so the path back up is always visible. */
                    <div className="stack">
                      <div className="frgrid frgrid--wide">
                        {[...atlas.keys()].sort().map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`frtile${macro === m ? ' is-open' : ''}`}
                            aria-expanded={macro === m}
                            onClick={() => {
                              setGroup(null)
                              setMacro((cur) => (cur === m ? null : m))
                            }}
                          >
                            <span className="frtile__name">{t(`filRouge.macro.${m}`)}</span>
                          </button>
                        ))}
                      </div>

                      {macro && (
                        <div className="frgrid frgrid--wide atlas__deeper">
                          {[...(atlas.get(macro)?.keys() ?? [])].sort().map((g) => (
                            <button
                              key={g}
                              type="button"
                              className={`frtile${group === g ? ' is-open' : ''}`}
                              aria-expanded={group === g}
                              onClick={() => setGroup((cur) => (cur === g ? null : g))}
                            >
                              <span className="frtile__name">{t(`filRouge.group.${g}`)}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {macro && group && (
                        <div className="frgrid frgrid--wide atlas__deeper">
                          {(atlas.get(macro)?.get(group) ?? [])
                            .map((o) => ({ o, name: countryName(o.code, i18n.language) }))
                            .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
                            .map(({ o, name }) => (
                              <button
                                key={o.code}
                                type="button"
                                className={`frtile${code === o.code ? ' is-chosen' : ''}${
                                  o.offered ? '' : ' is-locked'
                                }`}
                                disabled={!o.offered}
                                aria-pressed={code === o.code}
                                title={o.offered ? undefined : t('filRouge.lockedHint')}
                                onClick={() => pick('COUNTRY', o.code)}
                              >
                                <span className="frtile__name">{name}</span>
                                {o.drawn && (
                                  <span className="frtile__tag">{t('filRouge.drawn')}</span>
                                )}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* What the choice actually means, for the one category
                      where a host can pick somewhere they have never cooked
                      from. Nothing to say about a sealed one — that is the
                      point of it. */}
                  {code !== FIL_ROUGE_SEALED && (
                    <FilRougeDishes category="COUNTRY" code={category === 'COUNTRY' ? code : null} />
                  )}

                  {/* A hard week is answered by showing the next one rather
                      than by widening this one. Sunday is three days away; the
                      dinner is usually further off than that. */}
                  {nextCountries.length > 0 && (
                    <p className="muted">
                      {t('filRouge.nextWeek', {
                        items: nextCountries.map((n) => label('COUNTRY', n.code)).join(' · '),
                      })}
                    </p>
                  )}
                </div>
              ) : kind === 'LETTER' ? (
                /* THE ALPHABET, BIG, AND ALL OF IT FREE (0089). Six of these
                   are a bad evening rather than a hard one, so the line under
                   the grid says which — a warning, where there used to be a
                   price. */
                <div className="stack">
                  <div className="frgrid frgrid--letters">
                    {(byCategory.get('LETTER') ?? []).map((o) => (
                      <button
                        key={o.code}
                        type="button"
                        className={`frletter${category === 'LETTER' && code === o.code ? ' is-chosen' : ''}${
                          HARD_LETTERS.includes(o.code) ? ' is-hard' : ''
                        }`}
                        aria-pressed={category === 'LETTER' && code === o.code}
                        onClick={() => pick('LETTER', o.code)}
                      >
                        {o.code}
                      </button>
                    ))}
                  </div>
                  <p className="muted">{t('filRouge.hardLetters', { items: HARD_LETTERS.join(' · ') })}</p>
                </div>
              ) : (
                <div className="frgrid">
                  {(byCategory.get(kind) ?? []).map((o) => (
                    <Tile key={o.code} option={o} kind={kind} />
                  ))}
                </div>
              )}
            </Fold>
          ))}
        </>
      )}
    </div>
  )
}
