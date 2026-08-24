import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRound } from '../rounds/hooks'
import { DietaryPanelGrid } from '../rounds/DietaryPanelGrid'
import { ChatThread } from '../chat/ChatThread'
import { BackToTable } from '../../components/BackToTable'
import {
  getDietaryPanel,
  getMyAssignment,
  getMyBriefDraft,
  saveBriefDraft,
  submitBrief,
  notifyMyCook,
  type BriefIngredient,
} from '../../lib/rpc'

// Two ways to write a recipe, because there are two kinds of person here and
// the form was built for only one of them.
//
// Quick: a name, and either a link or everything typed into one block. Most
// people will never itemise fourteen ingredients with quantities and units
// on a phone, and a form that insists produces either abandonment or
// nonsense in the fields.
//
// Careful: itemised ingredients, for whoever enjoys that.
//
// Both produce the same thing. The quick block is stored as the procedure,
// which is what a cook reads anyway.
type Mode = 'quick' | 'careful'

// One ingredient per line. Quick mode stores the same rows careful mode
// does — the cook must get a list either way — it just doesn't make anyone
// tab through three inputs to produce one.
function linesToIngredients(text: string): BriefIngredient[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => ({ name, quantity: null, unit: null }))
}

export function BriefEditorPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()

  const { data: round, isLoading: roundLoading } = useRound(roundId)
  const { data: assignment } = useQuery({
    queryKey: ['rounds', roundId, 'my-assignment'],
    enabled: !!roundId,
    queryFn: () => getMyAssignment(roundId as string),
  })
  const { data: draft, isLoading: draftLoading, refetch: refetchDraft } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief-draft'],
    enabled: !!roundId,
    queryFn: () => getMyBriefDraft(roundId as string),
  })
  const { data: dietaryPanel } = useQuery({
    queryKey: ['rounds', roundId, 'dietary-panel'],
    enabled: !!roundId,
    queryFn: () => getDietaryPanel(roundId as string),
  })

  const [mode, setMode] = useState<Mode>('quick')
  const [dishName, setDishName] = useState('')
  const [ingredients, setIngredients] = useState<BriefIngredient[]>([{ name: '', quantity: null, unit: null }])
  const [quickIngredients, setQuickIngredients] = useState('')
  const [procedure, setProcedure] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadedFromDraft, setLoadedFromDraft] = useState(false)

  useEffect(() => {
    if (draft && !loadedFromDraft) {
      setDishName(draft.dish_name)
      setProcedure(draft.procedure)
      setExternalUrl(draft.external_url ?? '')
      setSubmitted(draft.status === 'SUBMITTED')
      // Quantities and units are the only thing careful mode adds. A list
      // carrying none of them was typed as free text, so it comes back as
      // the block it was written in instead of exploding into rows.
      const itemised = draft.ingredients.some((i) => i.quantity !== null || (i.unit ?? '').trim() !== '')
      if (draft.ingredients.length > 0 && itemised) {
        setIngredients(draft.ingredients)
        setMode('careful')
      } else {
        setQuickIngredients(draft.ingredients.map((i) => i.name).join('\n'))
      }
      setLoadedFromDraft(true)
    }
  }, [draft, loadedFromDraft])

  // Everything the sender wrote, as one searchable string. The quick mode
  // has no ingredient rows, so the block of text has to be scanned too.
  const written = useMemo(
    () =>
      [dishName, procedure, quickIngredients, ...ingredients.map((i) => i.name)]
        .join(' ')
        .toLowerCase(),
    [dishName, procedure, quickIngredients, ingredients],
  )

  // Allergen tags are found, not asked for.
  //
  // They used to be a row of checkboxes plus an "I confirm" tick — which is
  // a chore that means nothing, because a tick nobody understands is an
  // obstacle people learn to click through rather than consent. The labels
  // are already known (they come from the table's own restrictions), so the
  // honest thing is to look for them in what was written.
  //
  // Whole-word matching: "nuts" must not fire on "doughnuts", and "egg"
  // must not fire on "eggplant".
  const matched = useMemo(() => {
    const labels = Array.from(new Set(dietaryPanel?.map((d) => d.label) ?? []))
    return labels.filter((label) => {
      const escaped = label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(written)
    })
  }, [dietaryPanel, written])

  if (roundLoading || draftLoading || !round) return <p className="muted">…</p>

  const editingClosed = round.status !== 'ASSIGNED' || submitted
  const hasLink = externalUrl.trim().length > 0
  const hasBody =
    procedure.trim().length >= 30 || quickIngredients.trim().length > 0 || ingredients.some((i) => i.name.trim())
  const complete = dishName.trim().length >= 3 && (hasLink || hasBody)

  // Switching modes must not throw away what's already typed — the two
  // shapes hold the same list, so translate rather than reset.
  function switchMode(next: Mode) {
    if (next === mode) return
    if (next === 'careful') {
      const rows = linesToIngredients(quickIngredients)
      if (rows.length > 0) setIngredients(rows)
    } else {
      setQuickIngredients(
        ingredients
          .map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(' ').trim())
          .filter(Boolean)
          .join('\n'),
      )
    }
    setMode(next)
  }

  function updateIngredient(i: number, patch: Partial<BriefIngredient>) {
    setIngredients((prev) => prev.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing)))
  }

  async function save() {
    if (!roundId) return
    await saveBriefDraft({
      roundId,
      dishName,
      // The roulette decides the course, or the round is free-for-all —
      // either way it was never the sender's to pick, and offering a
      // dropdown invited people to contradict their own assignment.
      course: assignment?.course ?? 'OTHER',
      ingredients:
        mode === 'careful'
          ? ingredients.filter((i) => i.name.trim().length > 0)
          : linesToIngredients(quickIngredients),
      procedure,
      externalUrl: externalUrl.trim() || null,
      difficulty: null,
      estCost: null,
      prepMinutes: null,
      noteToCook: null,
      containsTags: matched,
      // Derived rather than ticked, so there is nothing left to confirm.
      containsTagsConfirmed: true,
    })
  }

  async function onSave() {
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      await save()
      setSaved(true)
      await refetchDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit() {
    if (!roundId) return
    setError(null)
    setBusy(true)
    try {
      await save()
      await submitBrief(roundId)
      // The recipe reaches its cook the instant it is submitted (0035), so the
      // notification belongs here rather than at the next phase change.
      void notifyMyCook(roundId)
      setSubmitted(true)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const known = t(`briefs.errors.${raw}`, { defaultValue: '' })
      setError(known || raw || t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('briefs.editorTitle')}</h1>

      {assignment && (
        <p className="muted">
          {t('briefs.writingFor', { name: assignment.cook_display_name ?? assignment.cook_secret_name })}
        </p>
      )}

      {/* Informative, never a choice: this is what the roulette handed you. */}
      <p className="muted">
        {assignment && round.slot_mode === 'CATEGORIES'
          ? t('briefs.assignedCourse', { course: t(`briefs.courseOption.${assignment.course}`) })
          : t('briefs.freeChoice')}
      </p>

      {editingClosed && <p className="muted">{submitted ? t('briefs.alreadySubmitted') : t('briefs.editingClosed')}</p>}
      {error && <div className="error">{error}</div>}
      {saved && !editingClosed && <p className="muted">{t('rounds.settings.saved')}</p>}

      {!editingClosed && (
        <div className="row">
          <button
            type="button"
            className={mode === 'quick' ? undefined : 'secondary'}
            onClick={() => switchMode('quick')}
          >
            {t('briefs.mode.quick')}
          </button>
          <button
            type="button"
            className={mode === 'careful' ? undefined : 'secondary'}
            onClick={() => switchMode('careful')}
          >
            {t('briefs.mode.careful')}
          </button>
        </div>
      )}

      <div className="stack card">
        <div>
          <label htmlFor="dish-name">{t('briefs.dishName')}</label>
          <input
            id="dish-name"
            disabled={editingClosed}
            value={dishName}
            onChange={(e) => setDishName(e.target.value)}
            maxLength={80}
          />
        </div>

        {mode === 'careful' && (
          <>
            <label>{t('briefs.ingredients')}</label>
            {ingredients.map((ing, i) => (
              <div key={i} className="row">
                <input
                  disabled={editingClosed}
                  placeholder={t('briefs.ingredientName')}
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, { name: e.target.value })}
                  style={{ flex: 2 }}
                />
                <input
                  disabled={editingClosed}
                  type="number"
                  placeholder={t('briefs.quantity')}
                  value={ing.quantity ?? ''}
                  onChange={(e) => updateIngredient(i, { quantity: e.target.value ? Number(e.target.value) : null })}
                  style={{ flex: 1 }}
                />
                <input
                  disabled={editingClosed}
                  placeholder={t('briefs.unit')}
                  value={ing.unit ?? ''}
                  onChange={(e) => updateIngredient(i, { unit: e.target.value })}
                  style={{ flex: 1 }}
                />
                {!editingClosed && (
                  <button
                    type="button"
                    className="chef-remove"
                    aria-label={t('actions.remove')}
                    onClick={() => setIngredients((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    🍌
                  </button>
                )}
              </div>
            ))}
            {!editingClosed && (
              <button
                type="button"
                className="secondary"
                onClick={() => setIngredients((prev) => [...prev, { name: '', quantity: null, unit: null }])}
              >
                {t('briefs.addIngredient')}
              </button>
            )}
          </>
        )}

        {mode === 'quick' && (
          <div>
            <label htmlFor="quick-ingredients">{t('briefs.ingredients')}</label>
            {/* The wide block this mode was missing. One per line — itemising
                with quantities and units is what careful mode is for, and
                asking for it here is what sent people away in the first
                place. */}
            <textarea
              id="quick-ingredients"
              disabled={editingClosed}
              rows={6}
              placeholder={t('briefs.ingredientsPlaceholder')}
              value={quickIngredients}
              onChange={(e) => setQuickIngredients(e.target.value)}
              maxLength={2000}
            />
          </div>
        )}

        <div>
          <label htmlFor="procedure">{t('briefs.procedure')}</label>
          <textarea
            id="procedure"
            disabled={editingClosed}
            rows={mode === 'quick' ? 8 : 6}
            placeholder={mode === 'quick' ? t('briefs.procedurePlaceholder') : undefined}
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            maxLength={5000}
          />
        </div>

        <div>
          <label htmlFor="external-url">{t('briefs.externalUrl')}</label>
          <input
            id="external-url"
            disabled={editingClosed}
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
          />
        </div>
      </div>

      {/* Found in what was written, and turned into the one instruction that
          actually helps at a shared table: put a card next to the dish. */}
      {matched.length > 0 && (
        <div className="paper stack">
          <strong>{t('briefs.labelDish')}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {t('briefs.labelDishWhy', { items: matched.join(', ') })}
          </p>
        </div>
      )}

      <h2>{t('dietary.panelTitle')}</h2>
      <DietaryPanelGrid entries={dietaryPanel} />

      {!editingClosed && (
        <div className="row">
          <button type="button" className="secondary" onClick={onSave} disabled={busy}>
            {t('actions.save')}
          </button>
          <button type="button" onClick={onSubmit} disabled={busy || !complete}>
            {t('actions.submit')}
          </button>
        </div>
      )}
      {!editingClosed && !complete && <p className="muted">{t('briefs.needsMore')}</p>}

      {assignment && (
        <>
          <h2>{t('chat.title')}</h2>
          <ChatThread pairingId={assignment.pairing_id} />
        </>
      )}
    </div>
  )
}
