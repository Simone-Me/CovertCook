import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { InlineConfirm } from '../../components/InlineConfirm'
import { FoodLabel } from '../../components/FoodLabel'
import { formatMoment } from '../../lib/datetime'
import { COURSES, forgetRecipe, listMyRecipes, type SavedRecipe } from '../../lib/rpc'

/**
 * Everything you kept, from every dinner.
 *
 * The filtering happens here, in the browser, on rows that are already loaded,
 * and that is a decision rather than a shortcut: ten saves at a dinner and a
 * few dinners a year is a few dozen rows. Sorting and searching them costs a
 * text input and an `Array.filter`. A server-side search would be an index, a
 * pagination scheme and two more round trips, built for a size this will not
 * reach.
 *
 * What is deliberately NOT a filter is the pseudonym. "Chef Basilic" is a
 * different person in every dinner — it is the name you knew somebody by that
 * evening, printed on the card because that is what you remember, and grouping
 * a book by it would collect strangers under one heading. The filter that
 * looks like it is about people is about the real name, which is why the
 * author stays a reference even though the recipe is a copy.
 */
export function RecipeBook() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  const [query, setQuery] = useState('')
  const [course, setCourse] = useState<string>('ALL')
  const [relation, setRelation] = useState<string>('ALL')
  const [forgetting, setForgetting] = useState<SavedRecipe | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: recipes } = useQuery({
    queryKey: ['my-recipes', profile?.id],
    enabled: !!profile?.id,
    queryFn: listMyRecipes,
  })

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (recipes ?? []).filter((r) => {
      if (course !== 'ALL' && r.course !== course) return false
      if (relation !== 'ALL' && r.relation !== relation) return false
      if (!needle) return true
      // The dinner's name counts as searchable: people remember "that evening
      // at Marta's" long after they have forgotten what the dish was called.
      const hay = [r.dish_name, r.round_name, r.procedure, ...r.ingredients.map((i) => i.name)]
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [recipes, query, course, relation])

  async function onForget() {
    if (!forgetting) return
    setError(null)
    setBusy(true)
    try {
      await forgetRecipe(forgetting.id)
      setForgetting(null)
      await queryClient.invalidateQueries({ queryKey: ['my-recipes'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  if (!recipes || recipes.length === 0) {
    return <p className="muted">{t('book.empty')}</p>
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <div className="row">
        <input
          type="search"
          value={query}
          placeholder={t('book.search')}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('book.search')}
        />
      </div>
      <div className="row">
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label={t('briefs.course')}>
          <option value="ALL">{t('book.anyCourse')}</option>
          {COURSES.map((c) => (
            <option key={c} value={c}>
              {t(`briefs.courseOption.${c}`)}
            </option>
          ))}
        </select>
        <select value={relation} onChange={(e) => setRelation(e.target.value)} aria-label={t('book.anyRole')}>
          <option value="ALL">{t('book.anyRole')}</option>
          <option value="COOKED">{t('book.relation.COOKED')}</option>
          <option value="WROTE">{t('book.relation.WROTE')}</option>
          <option value="TABLE">{t('book.relation.TABLE')}</option>
        </select>
      </div>

      <p className="muted">{t('book.count', { shown: shown.length, total: recipes.length })}</p>

      {shown.map((recipe) => (
        <details key={recipe.id} className="fold recipe">
          <summary className="fold__summary">
            <span className="fold__tri" aria-hidden="true">
              ▸
            </span>
            <span className="fold__title">{recipe.dish_name}</span>
            <span className="fold__aside">{t(`book.relation.${recipe.relation}`)}</span>
          </summary>
          <div className="fold__body stack">
            <p className="muted recipe__origin">
              {recipe.round_name}
              {recipe.dinner_at && ` · ${formatMoment(recipe.dinner_at, i18n.language)}`}
              {' · '}
              {t('book.writtenBy', {
                // Referenced, not frozen: an account that has since been erased
                // reads as nothing, and the card says so rather than keeping
                // somebody's name in a book they asked to leave.
                name: recipe.author_display_name ?? t('book.formerGuest'),
                pseudonym: recipe.author_secret_name ?? '—',
              })}
            </p>

            {recipe.ingredients.length > 0 && (
              <div>
                <label>{t('briefs.ingredients')}</label>
                <ul className="recipe__ingredients">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i}>
                      {[ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recipe.procedure && (
              <div>
                <label>{t('briefs.procedure')}</label>
                <p className="recipe__procedure">{recipe.procedure}</p>
              </div>
            )}

            {recipe.external_url && (
              <p>
                <a href={recipe.external_url} target="_blank" rel="noreferrer noopener">
                  {recipe.external_url}
                </a>
              </p>
            )}

            {/* Not decoration, and the reason the tags are copied at all:
                cooking this again, for different people, makes them matter
                again. */}
            {recipe.contains_tags.length > 0 && (
              <div>
                <label>{t('briefs.containsTags')}</label>
                <ul className="declared__list">
                  {recipe.contains_tags.map((tag) => (
                    <li key={tag}>
                      <FoodLabel label={tag} stacked />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {forgetting?.id === recipe.id ? (
              <InlineConfirm
                title={t('book.forgetTitle', { name: recipe.dish_name })}
                confirmLabel={t('book.forgetConfirm')}
                busy={busy}
                onConfirm={onForget}
                onCancel={() => setForgetting(null)}
              >
                {/* The warning tells the truth, and the truth has two versions.
                    While the dinner still exists this is undoable in ten
                    seconds from its menu. Once the dinner is gone, this copy
                    is the last one anywhere, and "are you sure" would be
                    hiding that. */}
                <p className="confirmbox__why">
                  {recipe.origin_exists ? t('book.forgetRecoverable') : t('book.forgetLastCopy')}
                </p>
              </InlineConfirm>
            ) : (
              <button type="button" className="secondary" onClick={() => setForgetting(recipe)}>
                {t('book.forget')}
              </button>
            )}
          </div>
        </details>
      ))}

      <ExportButtons recipes={recipes} />
    </div>
  )
}

/**
 * Two files, because two different people want this.
 *
 * JSON is completeness — every field, machine-readable, the shape Article 20
 * asks for. Markdown is a person who just wants to cook from it on a laptop in
 * a kitchen, and who would be badly served by being handed a JSON array and
 * told it is their recipe book.
 *
 * Both are assembled from rows the page has already loaded, so neither costs a
 * request. The blob is revoked immediately after the click: a URL left alive
 * pins the whole file in memory for as long as the tab is open.
 */
function ExportButtons({ recipes }: { recipes: SavedRecipe[] }) {
  const { t, i18n } = useTranslation()

  function download(filename: string, body: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function asMarkdown(): string {
    const lines: string[] = [`# ${t('book.title')}`, '']
    for (const r of recipes) {
      lines.push(`## ${r.dish_name}`, '')
      lines.push(
        `*${t(`briefs.courseOption.${r.course}`)} — ${r.round_name}` +
          (r.dinner_at ? `, ${formatMoment(r.dinner_at, i18n.language)}` : '') +
          '*',
        '',
      )
      if (r.ingredients.length > 0) {
        lines.push(`### ${t('briefs.ingredients')}`, '')
        for (const ing of r.ingredients) {
          lines.push(`- ${[ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}`)
        }
        lines.push('')
      }
      if (r.procedure) lines.push(`### ${t('briefs.procedure')}`, '', r.procedure, '')
      if (r.external_url) lines.push(`<${r.external_url}>`, '')
      if (r.contains_tags.length > 0) lines.push(`> ${t('briefs.containsTags')}: ${r.contains_tags.join(', ')}`, '')
      lines.push('---', '')
    }
    return lines.join('\n')
  }

  return (
    <div className="row">
      <button
        type="button"
        className="secondary"
        onClick={() => download('covertcook-recipes.md', asMarkdown(), 'text/markdown;charset=utf-8')}
      >
        {t('book.exportMarkdown')}
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          download('covertcook-recipes.json', JSON.stringify(recipes, null, 2), 'application/json')
        }
      >
        {t('book.exportJson')}
      </button>
    </div>
  )
}
