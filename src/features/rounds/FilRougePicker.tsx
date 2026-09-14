import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Fold } from '../../components/Fold'
import { ChoiceList } from '../../components/ChoiceList'
import { countryName, useFilRougeLabel, FIL_ROUGE_MARK, HARD_LETTERS } from '../../lib/filRouge'
import { FilRougeDishes } from './FilRougeDishes'
import {
  filRougeEditorial,
  filRougeTurnsAt,
  filRougeUpcoming,
  listFilRouge,
  FIL_ROUGE_SEALED,
  type FilRougeCategory,
  type FilRougeOption,
  type FilRougeScope,
} from '../../lib/rpc'

// THE TWO FREE KINDS FIRST, and that is the whole of the reasoning: since 0091
// an ingredient and a way of cooking are free in full, for everybody, for ever,
// and the four below them open through the week's selection or through Crème.
// A host on the free app should meet what is theirs before what is not.
const CATEGORIES: FilRougeCategory[] = ['STAPLE', 'TECHNIQUE', 'COUNTRY', 'COLOUR', 'LETTER', 'ERA']

// The two kinds that are free in full, for ever (0091). The server is the
// authority — `fil_rouge_category.free` is what `offered` is computed from —
// and this list exists only so the picker can SAY so: with Crème every row is
// offered, so "everything here is unlocked" cannot be read back off the shelf.
const FREE_KINDS: FilRougeCategory[] = ['STAPLE', 'TECHNIQUE']

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
  // Why these, this week. Written by the author rather than by the app, so it
  // is prose from the database rather than a string from the translations.
  const { data: editorial } = useQuery({
    queryKey: ['fil-rouge', 'editorial'],
    queryFn: filRougeEditorial,
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

  // THIS WEEK'S SELECTION, ACROSS THE KINDS. The shelf already says which rows
  // are in it; the panel only has to gather them. Shown above the six folds
  // because it is the answer to the question somebody actually has — "what
  // should tonight be?" — and the folds are the answer to a narrower one.
  const week = useMemo(
    () => (shelf ?? []).filter((o) => o.drawn && o.offered && o.category !== 'STAPLE' && o.category !== 'TECHNIQUE'),
    [shelf],
  )

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
          {/* 2. THE AUTHOR'S WEEK, above the kinds.
                 The free part of this feature used to be a lottery — whatever
                 the shuffle reached — which is generous and unplannable. It is
                 a person's selection now (0091), and a selection is only worth
                 anything with the reason beside it: a season, a holiday, an
                 anniversary. Two kinds are free whatever happens, so nobody is
                 ever left with nothing; these are the four that open here for
                 the week, and stay open with Crème. */}
          {week.length > 0 && (
            <div className="weekpick">
              <p className="weekpick__head">{t('filRouge.week.title')}</p>
              {editorial?.title && <p className="weekpick__why">{editorial.title}</p>}
              <p className="muted weekpick__body">
                {editorial?.body ?? t('filRouge.week.noNote')}
              </p>

              {rule === 'SHARED' && (
                <div className="weekpick__row">
                  {week.map((o) => (
                    <button
                      key={`${o.category}-${o.code}`}
                      type="button"
                      className={`frpick${category === o.category && code === o.code ? ' is-chosen' : ''}`}
                      aria-pressed={category === o.category && code === o.code}
                      onClick={() => pick(o.category, o.code)}
                    >
                      <span className="frpick__kind">{t(`filRouge.category.${o.category}`)}</span>
                      <span className="frpick__name">{label(o.category, o.code)}</span>
                    </button>
                  ))}
                </div>
              )}

              {countdown && <p className="muted weekpick__body">{countdown}</p>}
            </div>
          )}

          {week.length === 0 && countdown && <p className="muted">{countdown}</p>}

          {/* 3. SIX FOLDS, closed, one per kind. The chosen one carries its
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
              {FREE_KINDS.includes(kind) && (
                <p className="muted filfree">{t('filRouge.freeKind')}</p>
              )}

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
                    <div className="pinboard">
                      {found.map(({ o, name }) => (
                        <button
                          key={o.code}
                          type="button"
                          className={`pin${code === o.code ? ' is-chosen' : ''}${
                            o.offered ? '' : ' is-locked'
                          }${o.drawn ? ' is-week' : ''}`}
                          disabled={!o.offered}
                          aria-pressed={code === o.code}
                          title={
                            o.offered ? (o.drawn ? t('filRouge.drawn') : undefined) : t('filRouge.lockedHint')
                          }
                          onClick={() => pick('COUNTRY', o.code)}
                        >
                          {name}
                        </button>
                      ))}
                      {found.length === 0 && <p className="muted">{t('filRouge.noCountry')}</p>}
                    </div>
                  ) : (
                    /* THE ATLAS, WALKED DOWN IN PLACE.
                       The three lists used to be stacked: seven staples, then
                       — underneath all seven — the regions of the open one,
                       then underneath those the countries. Which is a path,
                       drawn as three separate shelves, so the answer to "what
                       is inside this one?" appeared a screen away from the
                       thing you pressed. Now each list opens directly under its
                       own row, indented, and the way back up is the row you
                       came through.

                       THE COUNTRIES ARE SMALL AND THE REGIONS ARE LARGE, which
                       is the shape of the decision rather than of the data:
                       picking a part of the world is a real choice made twice,
                       and picking Portugal out of the Mediterranean is reading
                       a list. So the branches are wide rows with the name
                       filling them, and the countries are little notes pinned
                       to a board — which is also what a kitchen wall looks
                       like. */
                    <div className="atlas">
                      {[...atlas.keys()].sort().map((m) => (
                        <div key={m} className="atlas__branch">
                          <button
                            type="button"
                            className={`frrow${macro === m ? ' is-open' : ''}`}
                            aria-expanded={macro === m}
                            onClick={() => {
                              setGroup(null)
                              setMacro((cur) => (cur === m ? null : m))
                            }}
                          >
                            {t(`filRouge.macro.${m}`)}
                          </button>

                          {macro === m && (
                            <div className="atlas__sub">
                              {[...(atlas.get(m)?.keys() ?? [])].sort().map((g) => (
                                <div key={g} className="atlas__branch">
                                  <button
                                    type="button"
                                    className={`frrow frrow--region${group === g ? ' is-open' : ''}`}
                                    aria-expanded={group === g}
                                    onClick={() => setGroup((cur) => (cur === g ? null : g))}
                                  >
                                    {t(`filRouge.group.${g}`)}
                                  </button>

                                  {group === g && (
                                    <div className="pinboard">
                                      {(atlas.get(m)?.get(g) ?? [])
                                        .map((o) => ({ o, name: countryName(o.code, i18n.language) }))
                                        .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
                                        .map(({ o, name }) => (
                                          <button
                                            key={o.code}
                                            type="button"
                                            className={`pin${code === o.code ? ' is-chosen' : ''}${
                                              o.offered ? '' : ' is-locked'
                                            }${o.drawn ? ' is-week' : ''}`}
                                            disabled={!o.offered}
                                            aria-pressed={code === o.code}
                                            title={
                                              o.offered
                                                ? o.drawn
                                                  ? t('filRouge.drawn')
                                                  : undefined
                                                : t('filRouge.lockedHint')
                                            }
                                            onClick={() => pick('COUNTRY', o.code)}
                                          >
                                            {name}
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
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
