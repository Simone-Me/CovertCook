import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRound } from '../rounds/hooks'
import { DietaryPanelGrid } from '../rounds/DietaryPanelGrid'
import { ChatThread } from '../chat/ChatThread'
import { BackToTable } from '../../components/BackToTable'
import { InlineConfirm } from '../../components/InlineConfirm'
import {
  discardBriefDraft,
  getDietaryPanel,
  getSlots,
  getMyAssignment,
  getMyBriefDrafts,
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

// The column refuses anything without a scheme, and somebody pasting a recipe
// from their phone's address bar gets "cuisine-az.com/tarte" with no https://
// in front of it. Refusing that is technically correct and completely useless:
// there is exactly one thing they could have meant. So it is completed rather
// than rejected — and completed in the field, where it can be seen and
// corrected, never silently on the way to the database.
function normaliseUrl(raw: string): string {
  const url = raw.trim()
  if (url === '' || /^https?:\/\//i.test(url)) return url
  // Anything without a dot is not a domain someone forgot to prefix; it is
  // something else entirely, and guessing at it would be inventing a link.
  return /^[^\s/]+\.[^\s/]/.test(url) ? `https://${url}` : url
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
  const { data: drafts, isLoading: draftLoading, refetch: refetchDraft } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief-draft'],
    enabled: !!roundId,
    queryFn: () => getMyBriefDrafts(roundId as string),
  })
  const { data: dietaryPanel } = useQuery({
    queryKey: ['rounds', roundId, 'dietary-panel'],
    enabled: !!roundId,
    queryFn: () => getDietaryPanel(roundId as string),
  })
  // The whole menu, not just my line of it. One course named in a grey
  // sentence is a fact with nothing to compare it against — the reader cannot
  // tell whether "Dessert" is one of two courses or one of six, and half of
  // them did not notice it was there at all. The menu shows the dinner and
  // marks the reader's place in it.
  const { data: slots } = useQuery({
    queryKey: ['rounds', roundId, 'slots'],
    enabled: !!roundId && round?.slot_mode === 'CATEGORIES',
    queryFn: () => getSlots(roundId as string),
  })

  // WHICH OF THE SENDER'S IDEAS IS ON THE PAGE (0077).
  //
  // The form itself is untouched — one recipe, the same two ways of writing
  // it. What is new is that there may be up to three of them and this says
  // which. Keeping one form and swapping its contents was deliberate: three
  // copies of a long form stacked down a page is not "more room to be kind to
  // your cook", it is a wall, and the second and third ideas are optional.
  const [position, setPosition] = useState(1)
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
  // Which idea the fields currently hold, so switching between them reloads
  // rather than leaving idea 1's method under idea 2's title.
  const [loadedFor, setLoadedFor] = useState<number | null>(null)
  // Sending is the one irreversible thing on this page, and the button that
  // does it used to be the same size and weight as "Save". This is what stands
  // between them.
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)

  const draft = drafts?.find((d) => d.recipe_no === position)
  // Sending sends everything at once, so "already sent" is a fact about the
  // whole page rather than about the idea currently showing.
  const anySent = (drafts ?? []).some((d) => d.status !== 'DRAFT')

  useEffect(() => {
    if (!drafts || loadedFor === position) return
    setDishName(draft?.dish_name ?? '')
    setProcedure(draft?.procedure ?? '')
    setExternalUrl(draft?.external_url ?? '')
    setSubmitted(anySent)
    // Quantities and units are the only thing careful mode adds. A list
    // carrying none of them was typed as free text, so it comes back as
    // the block it was written in instead of exploding into rows.
    const rows = draft?.ingredients ?? []
    const itemised = rows.some((i) => i.quantity !== null || (i.unit ?? '').trim() !== '')
    if (rows.length > 0 && itemised) {
      setIngredients(rows)
      setQuickIngredients('')
      setMode('careful')
    } else {
      setIngredients([{ name: '', quantity: null, unit: null }])
      setQuickIngredients(rows.map((i) => i.name).join('\n'))
      setMode('quick')
    }
    setLoadedFor(position)
  }, [drafts, draft, anySent, loadedFor, position])

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

  // What the cook needs, checked here so it can be said in words before the
  // send rather than bounced back as a constraint name afterwards.
  //
  //   a name, AND
  //   either a link to follow
  //   or the recipe written out — the method AND the list, both.
  //
  // The second half used to be an OR, which let a bare list of ingredients
  // count as a complete recipe: the cook got seven things to buy and no idea
  // what to do with them.
  const rows = mode === 'careful' ? ingredients : linesToIngredients(quickIngredients)
  const link = externalUrl.trim()
  const linkOk = link !== '' && /^https?:\/\//i.test(link)
  const hasIngredients = rows.some((i) => i.name.trim().length > 0)
  const procedureWritten = procedure.trim().length
  const writtenOut = procedureWritten >= 30 && hasIngredients

  // In the order the form reads, so the list points down the page. Each entry
  // is a key under briefs.missing — the sentence lives in the translations,
  // and it names the field rather than describing the failure.
  const missing: string[] = []
  if (dishName.trim() === '') missing.push('dishName')
  else if (dishName.trim().length < 3) missing.push('dishNameShort')
  if (link !== '' && !linkOk) missing.push('linkMalformed')
  if (!writtenOut && !linkOk) {
    if (!hasIngredients) missing.push('ingredients')
    if (procedureWritten === 0) missing.push('procedure')
    else if (procedureWritten < 30) missing.push('procedureShort')
  }
  const complete = missing.length === 0

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

  // Every refusal this page can receive, turned into a sentence about a field.
  //
  // Three shapes arrive here and all three used to reach the screen raw:
  //
  //   * a code from submit_brief / save_brief_draft (0055) — translated;
  //   * DIETARY_CONFLICT|label, which carries the allergen it hit, because
  //     "conflicts with a restriction" without saying which one leaves the
  //     sender to guess at somebody else's medical record;
  //   * a Postgres constraint violation, which is what a database that has
  //     not run 0055 yet still produces. `briefs_check1` is not a thing a
  //     person can act on, so the ones that can actually fire are mapped to
  //     the field they are about.
  function explain(raw: string): string {
    if (raw.startsWith('DIETARY_CONFLICT|')) {
      return t('briefs.errors.DIETARY_CONFLICT', { items: raw.slice('DIETARY_CONFLICT|'.length) })
    }
    // submit_brief validates every idea and names the one that failed
    // ("PROCEDURE_TOO_SHORT:2"), because "the method is too short" is no help
    // at all when there are three methods on the page (0077).
    const parts = raw.match(/^([A-Z_]+):(\d)$/)
    if (parts) {
      const what = t(`briefs.errors.${parts[1]}`, { defaultValue: parts[1] })
      return t('briefs.errors.inRecipe', { recipe: parts[2], what })
    }
    const known = t(`briefs.errors.${raw}`, { defaultValue: '' })
    if (known) return known

    const constraint = raw.match(/violates check constraint "([^"]+)"/)?.[1]
    if (constraint) {
      const byName = t(`briefs.errors.constraint.${constraint}`, { defaultValue: '' })
      if (byName) return byName
    }
    return raw || t('errors.generic')
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
      externalUrl: normaliseUrl(externalUrl) || null,
      difficulty: null,
      estCost: null,
      prepMinutes: null,
      noteToCook: null,
      containsTags: matched,
      // Derived rather than ticked, so there is nothing left to confirm.
      containsTagsConfirmed: true,
      position,
    })
  }

  /** Move to another idea, keeping what is on the page.
   *
   *  Saved on the way out rather than on the way in: switching tabs is not an
   *  act of commitment, and losing three paragraphs to a mis-tap is the kind
   *  of thing people do not come back from. */
  async function switchTo(next: number) {
    if (next === position) return
    setError(null)
    setSaved(false)
    if (!editingClosed) {
      setBusy(true)
      try {
        if (dishName.trim() || procedure.trim() || externalUrl.trim()) await save()
        await refetchDraft()
      } catch (err) {
        setError(explain(err instanceof Error ? err.message : ''))
        setBusy(false)
        return
      }
      setBusy(false)
    }
    setPosition(next)
  }

  async function onDiscard() {
    if (!roundId || position === 1) return
    setError(null)
    setBusy(true)
    try {
      await discardBriefDraft(roundId, position)
      await refetchDraft()
      setLoadedFor(null)
      setPosition(1)
    } catch (err) {
      setError(explain(err instanceof Error ? err.message : ''))
    } finally {
      setBusy(false)
    }
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
      setError(explain(err instanceof Error ? err.message : ''))
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit() {
    if (!roundId) return
    setError(null)
    // The button is disabled while anything is missing, but a disabled button
    // is not a rule — this is the same check on the way out, so a keyboard, a
    // stale render or a hand-made call meets it too.
    if (!complete) {
      setConfirmingSubmit(false)
      setError(t('briefs.missingIntro', { items: missing.map((k) => t(`briefs.missing.${k}`)).join(', ') }))
      return
    }
    setBusy(true)
    try {
      await save()
      await submitBrief(roundId)
      // The recipe reaches its cook the instant it is submitted (0035), so the
      // notification belongs here rather than at the next phase change.
      void notifyMyCook(roundId)
      setConfirmingSubmit(false)
      setSubmitted(true)
    } catch (err) {
      setError(explain(err instanceof Error ? err.message : ''))
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

      {/* Informative, never a choice: this is what the roulette handed you.
          Printed as the menu it is, with your line marked, because a course
          named in a grey sentence between two other grey sentences is a thing
          people read past — and then write a starter for a dessert slot. */}
      {assignment && round.slot_mode === 'CATEGORIES' && (slots?.length ?? 0) > 0 ? (
        <div className="menucard">
          <p className="menucard__head">{t('briefs.theMenu')}</p>
          <ul className="menucard__list">
            {(slots ?? []).map((slot) => {
              const yours = slot.id === assignment.slot_id
              return (
                <li key={slot.id} className="menucard__row">
                  <div className={`menucard__course${yours ? ' is-now is-yours' : ''}`}>
                    <span className="menucard__name">{t(`briefs.courseOption.${slot.course}`)}</span>
                    {yours && <span className="menucard__course-kind">{t('briefs.yours')}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="menucard__note">
            {t('briefs.assignedCourse', { course: t(`briefs.courseOption.${assignment.course}`) })}
          </p>
        </div>
      ) : (
        <p className="muted">
          {assignment && round.slot_mode === 'CATEGORIES'
            ? t('briefs.assignedCourse', { course: t(`briefs.courseOption.${assignment.course}`) })
            : t('briefs.freeChoice')}
        </p>
      )}

      {/* THE IDEAS, AS TABS, and only on a dinner that asked for more than one.
          A free dinner never sees this row at all — the feature has to be
          invisible where it is not bought, or every host is looking at a
          control that does nothing for them.
          A tab appears for each idea already written plus one empty one, up to
          the dinner's own limit: three empty tabs on arrival would read as
          three things to do, and the second and third are a kindness rather
          than a requirement. */}
      {round.recipes_per_brief > 1 && (
        <div className="stack">
          <div className="row ideatabs" role="tablist" aria-label={t('briefs.ideas.label')}>
            {Array.from(
              { length: Math.min(round.recipes_per_brief, (drafts?.length ?? 0) + 1) },
              (_, i) => i + 1,
            ).map((n) => {
              const written = drafts?.find((d) => d.recipe_no === n)
              return (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={position === n}
                  className={position === n ? 'ideatab is-now' : 'ideatab secondary'}
                  disabled={busy}
                  onClick={() => switchTo(n)}
                >
                  {written?.dish_name?.trim()
                    ? written.dish_name
                    : t('briefs.ideas.tab', { n })}
                </button>
              )
            })}
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {t(anySent ? 'briefs.ideas.sentHint' : 'briefs.ideas.hint')}
          </p>
          {/* Only a second or third one, and only before it has gone: the
              first idea is the recipe, and an offer already in front of the
              cook is not the sender's to take back. */}
          {!editingClosed && position > 1 && draft && (
            <button type="button" className="secondary" disabled={busy} onClick={onDiscard}>
              {t('briefs.ideas.discard')}
            </button>
          )}
        </div>
      )}

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
            inputMode="url"
            placeholder="https://…"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            // On the way out of the field, not on every keystroke: prefixing
            // while somebody is still typing rewrites the text under their
            // cursor.
            onBlur={() => setExternalUrl((prev) => normaliseUrl(prev))}
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
        <>
          {/* What is still missing, named. "A name, and either a link or the
              recipe written out" was a restatement of the rule, and a rule
              read next to a disabled button does not say which half of it you
              have failed — the reader has to hold the whole thing in their
              head and audit their own form against it. This says the field. */}
          {!complete && (
            <div className="notice notice--wanting">
              {t('briefs.missingIntro', { items: missing.map((k) => t(`briefs.missing.${k}`)).join(', ') })}
            </div>
          )}

          <div className="row">
            <button type="button" className="secondary" onClick={onSave} disabled={busy}>
              {t('actions.save')}
            </button>
            {/* Saving is reversible and sending is not, so only one of these
                two asks a second time. The consequence is on the button
                itself as well as in the box it opens: "Submit" said nothing
                about the door closing behind it. */}
            <button
              type="button"
              onClick={() => setConfirmingSubmit(true)}
              disabled={busy || !complete || confirmingSubmit}
            >
              {t('briefs.sendFinal')}
            </button>
          </div>

          {confirmingSubmit && (
            <InlineConfirm
              title={t('briefs.submitConfirmTitle')}
              confirmLabel={t('briefs.submitConfirmLabel')}
              busy={busy}
              onConfirm={onSubmit}
              onCancel={() => setConfirmingSubmit(false)}
            >
              <p className="confirmbox__why">{t('briefs.submitConfirmWhy')}</p>
              {/* Read it back before it goes. Not a preview of the page they
                  are already looking at — the three things that are about to
                  become somebody else's evening, in one line each. */}
              <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>{t('briefs.summaryDish', { name: dishName.trim() })}</li>
                <li>
                  {linkOk
                    ? t('briefs.summaryLink', { url: link })
                    : t('briefs.summaryWritten', { n: rows.filter((i) => i.name.trim()).length })}
                </li>
                <li>{t('briefs.summaryFor', { name: assignment?.cook_display_name ?? assignment?.cook_secret_name ?? '' })}</li>
              </ul>
              {/* The last moment it can still be changed. The panel above says
                  the same thing while the recipe is being written, but the
                  send is where somebody is actually deciding — and after it
                  the form locks, so a sentence here is the difference between
                  a choice and a discovery. It says what will happen, not what
                  is wrong: the dish goes out and the table is told. */}
              {matched.length > 0 && (
                <p className="confirmbox__why">
                  {t('briefs.submitConfirmAllergen', { items: matched.join(', ') })}
                </p>
              )}
            </InlineConfirm>
          )}
        </>
      )}

      {assignment && (
        <>
          <h2>{t('chat.title')}</h2>
          <ChatThread pairingId={assignment.pairing_id} roundId={roundId} />
        </>
      )}
    </div>
  )
}
