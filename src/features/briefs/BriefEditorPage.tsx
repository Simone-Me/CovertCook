import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRound } from '../rounds/hooks'
import { DietaryPanelGrid } from '../rounds/DietaryPanelGrid'
import { ChatThread } from '../chat/ChatThread'
import {
  getDietaryPanel,
  getMyAssignment,
  getMyBriefDraft,
  saveBriefDraft,
  submitBrief,
  type BriefIngredient,
  type Course,
} from '../../lib/rpc'

const COURSES: Course[] = ['STARTER', 'MAIN', 'DESSERT', 'DRINK', 'OTHER']

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

  const [dishName, setDishName] = useState('')
  const [course, setCourse] = useState<Course>('OTHER')
  const [ingredients, setIngredients] = useState<BriefIngredient[]>([{ name: '', quantity: null, unit: null }])
  const [procedure, setProcedure] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [estCost, setEstCost] = useState('')
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null)
  const [noteToCook, setNoteToCook] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [tagsConfirmed, setTagsConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadedFromDraft, setLoadedFromDraft] = useState(false)

  useEffect(() => {
    if (draft && !loadedFromDraft) {
      setDishName(draft.dish_name)
      setCourse(draft.course)
      setIngredients(draft.ingredients.length > 0 ? draft.ingredients : [{ name: '', quantity: null, unit: null }])
      setProcedure(draft.procedure)
      setExternalUrl(draft.external_url ?? '')
      setDifficulty(draft.difficulty)
      setEstCost(draft.est_cost ?? '')
      setPrepMinutes(draft.prep_minutes)
      setNoteToCook(draft.note_to_cook ?? '')
      setTags(draft.contains_tags)
      setTagsConfirmed(draft.contains_tags_confirmed)
      setSubmitted(draft.status === 'SUBMITTED')
      setLoadedFromDraft(true)
    } else if (assignment && !draft && !loadedFromDraft) {
      setCourse(assignment.course)
      setLoadedFromDraft(true)
    }
  }, [draft, assignment, loadedFromDraft])

  if (roundLoading || draftLoading || !round) return <p className="muted">…</p>

  const editingClosed = round.status !== 'ASSIGNED' || submitted
  const panelLabels = Array.from(new Set(dietaryPanel?.map((d) => d.label) ?? []))

  function toggleTag(label: string) {
    setTags((prev) => (prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]))
    setTagsConfirmed(false)
  }

  function addCustomTag() {
    const label = newTag.trim()
    if (!label || tags.includes(label)) return
    setTags((prev) => [...prev, label])
    setNewTag('')
    setTagsConfirmed(false)
  }

  function updateIngredient(i: number, patch: Partial<BriefIngredient>) {
    setIngredients((prev) => prev.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing)))
  }

  async function onSave() {
    if (!roundId) return
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      await saveBriefDraft({
        roundId,
        dishName,
        course,
        ingredients: ingredients.filter((i) => i.name.trim().length > 0),
        procedure,
        externalUrl: externalUrl.trim() || null,
        difficulty,
        estCost: estCost.trim() || null,
        prepMinutes,
        noteToCook: noteToCook.trim() || null,
        containsTags: tags,
        containsTagsConfirmed: tagsConfirmed,
      })
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
      await onSave()
      await submitBrief(roundId)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <h1>{t('briefs.editorTitle')}</h1>
      {assignment && (
        <p className="muted">{t('briefs.writingFor', { name: assignment.cook_display_name ?? assignment.cook_secret_name })}</p>
      )}

      {editingClosed && <p className="muted">{submitted ? t('briefs.alreadySubmitted') : t('briefs.editingClosed')}</p>}
      {error && <div className="error">{error}</div>}
      {saved && !editingClosed && <p className="muted">{t('rounds.settings.saved')}</p>}

      <h2>{t('dietary.panelTitle')}</h2>
      <DietaryPanelGrid entries={dietaryPanel} />

      <div className="stack card">
        <div>
          <label htmlFor="dish-name">{t('briefs.dishName')}</label>
          <input id="dish-name" disabled={editingClosed} value={dishName} onChange={(e) => setDishName(e.target.value)} maxLength={80} />
        </div>

        <div>
          <label htmlFor="course">{t('briefs.course')}</label>
          <select id="course" disabled={editingClosed} value={course} onChange={(e) => setCourse(e.target.value as Course)}>
            {COURSES.map((c) => (
              <option key={c} value={c}>
                {t(`briefs.courseOption.${c}`)}
              </option>
            ))}
          </select>
        </div>

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
              <button type="button" className="secondary" onClick={() => setIngredients((prev) => prev.filter((_, idx) => idx !== i))}>
                {t('actions.remove')}
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

        <div>
          <label htmlFor="procedure">{t('briefs.procedure')}</label>
          <textarea
            id="procedure"
            disabled={editingClosed}
            rows={6}
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            maxLength={5000}
          />
          <p className="muted">{t('briefs.procedureMinLength', { count: procedure.length })}</p>
        </div>

        <div>
          <label htmlFor="external-url">{t('briefs.externalUrl')}</label>
          <input id="external-url" disabled={editingClosed} value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} />
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor="difficulty">{t('briefs.difficulty')}</label>
            <select
              id="difficulty"
              disabled={editingClosed}
              value={difficulty ?? ''}
              onChange={(e) => setDifficulty(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="prep-minutes">{t('briefs.prepMinutes')}</label>
            <input
              id="prep-minutes"
              disabled={editingClosed}
              type="number"
              value={prepMinutes ?? ''}
              onChange={(e) => setPrepMinutes(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="est-cost">{t('briefs.estCost')}</label>
            <input id="est-cost" disabled={editingClosed} value={estCost} onChange={(e) => setEstCost(e.target.value)} />
          </div>
        </div>

        <div>
          <label htmlFor="note-to-cook">{t('briefs.noteToCook')}</label>
          <textarea id="note-to-cook" disabled={editingClosed} rows={3} value={noteToCook} onChange={(e) => setNoteToCook(e.target.value)} />
        </div>

        <label>{t('briefs.containsTags')}</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {panelLabels.map((label) => (
            <label key={label} className="row" style={{ width: 'auto' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                disabled={editingClosed}
                checked={tags.includes(label)}
                onChange={() => toggleTag(label)}
              />
              {label}
            </label>
          ))}
        </div>
        {tags.filter((tag) => !panelLabels.includes(tag)).length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {tags
              .filter((tag) => !panelLabels.includes(tag))
              .map((tag) => (
                <span key={tag} className="badge">
                  {tag}
                  {!editingClosed && (
                    <button type="button" className="secondary" onClick={() => toggleTag(tag)} style={{ padding: '0 6px' }}>
                      ×
                    </button>
                  )}
                </span>
              ))}
          </div>
        )}
        {!editingClosed && (
          <div className="row">
            <input placeholder={t('briefs.addTagPlaceholder')} value={newTag} onChange={(e) => setNewTag(e.target.value)} />
            <button type="button" className="secondary" onClick={addCustomTag}>
              {t('briefs.addTag')}
            </button>
          </div>
        )}

        <label className="row">
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            disabled={editingClosed}
            checked={tagsConfirmed}
            onChange={(e) => setTagsConfirmed(e.target.checked)}
          />
          {t('briefs.tagsConfirmed')}
        </label>

        {!editingClosed && (
          <div className="row">
            <button type="button" className="secondary" onClick={onSave} disabled={busy}>
              {t('actions.save')}
            </button>
            <button type="button" onClick={onSubmit} disabled={busy}>
              {t('actions.submit')}
            </button>
          </div>
        )}
      </div>

      {assignment && (
        <>
          <h2>{t('chat.title')}</h2>
          <ChatThread pairingId={assignment.pairing_id} />
        </>
      )}
    </div>
  )
}
