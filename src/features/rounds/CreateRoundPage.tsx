import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BackToTable } from '../../components/BackToTable'
import { InlineConfirm } from '../../components/InlineConfirm'
import {
  applySetup,
  DEFAULT_SETUP,
  PRESETS,
  randomSetup,
  rollLooks,
  type Preset,
  type RoundSetup,
} from '../../lib/roundSetup'
import {
  deleteSavedSetup,
  listNameThemes,
  listSavedSetups,
  listTableThemes,
  myProStatus,
  PRO_REQUIRED,
  THEME_LOCKED,
  type SavedSetup,
} from '../../lib/rpc'

/**
 * CHOOSING A DINNER BEFORE CONFIGURING ONE.
 *
 * The screen used to be a name, a radio with two positions, and — behind the
 * second position — every decision the app can take, unrolled in place. Both
 * halves were wrong in the same way: "classic" was one dinner presented as the
 * absence of a choice, and "customise" was fifteen questions presented as one.
 * Most hosts do not want to answer fifteen questions and are not served by
 * being given none; what they want is to point at the evening they have in
 * mind.
 *
 * So the door is a grid of tables somebody might actually want to lay — the
 * game as designed, a loud one, a quiet one, one with no secrets — plus a dice
 * for the table that wants to be surprised and a card that opens the long form
 * for the one host in ten who has a fifteen-question answer.
 *
 * AND THE HOST'S OWN CARDS SIT ON THE SAME GRID (0090). A saved setup is not a
 * lesser kind of preset: it is the one the person in front of the screen
 * actually uses, so it is on the shelf with the rest, and the × is on the card
 * because that is where somebody looks for it.
 *
 * PRESSING A CARD DOES NOT CREATE A DINNER. It opens it, so the answers are
 * readable before they are taken — an evening whose rules nobody saw is the
 * one thing a card like this could do that would be worse than the old form.
 */
export function CreateRoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

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
  const { data: pro } = useQuery({
    queryKey: ['pro', 'status'],
    queryFn: myProStatus,
    staleTime: 60 * 1000,
  })
  const { data: mine } = useQuery({
    queryKey: ['saved-setups'],
    queryFn: listSavedSetups,
  })

  const isPro = pro?.pro ?? false

  /** What a card will actually create, worked out at the moment it is needed:
   *  two of them are rolled rather than written down. */
  function setupFor(preset: Preset): RoundSetup {
    if (preset.key === 'RANDOM') return randomSetup(isPro, nameThemes, tableThemes)
    if (preset.key === 'PARTY') {
      return { ...(preset.setup as RoundSetup), ...rollLooks(nameThemes, tableThemes) }
    }
    return preset.setup ?? DEFAULT_SETUP
  }

  /** A saved card, read defensively: it was written by whatever version of the
   *  form the host was using that day, and a missing field is the normal case
   *  rather than a corrupt row. */
  function savedSetup(row: SavedSetup): RoundSetup {
    return { ...DEFAULT_SETUP, ...(row.setup as Partial<RoundSetup>) }
  }

  async function create(setup: RoundSetup) {
    setError(null)
    setSubmitting(true)
    try {
      const roundId = await applySetup(name, setup)
      navigate(`/rounds/${roundId}`, { replace: true })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const known =
        raw === THEME_LOCKED ? t('themes.locked') : raw === PRO_REQUIRED ? t('pro.needed') : null
      setError(known ?? raw ?? t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(id: string) {
    setRemoving(null)
    try {
      await deleteSavedSetup(id)
      await queryClient.invalidateQueries({ queryKey: ['saved-setups'] })
      if (chosen === id) setChosen(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  /** The dinner a card describes, in the words the form uses for the same
   *  answers. Four lines, never fifteen: this is the gist, and the form is
   *  where the rest of it lives. */
  function summary(setup: RoundSetup): string {
    return [
      t(`rounds.anonymity.${setup.anonymity}`),
      t(`rounds.access.${setup.access}`),
      setup.seats === null ? t('rounds.door.noLimit') : t('rounds.door.seats', { count: setup.seats }),
      t(`rounds.slotMode.${setup.slotMode}`),
      t(`rounds.voting.${setup.votingMode}`),
      setup.costMode === 'NONE' ? t('costs.mode.NONE') : t('costs.mode.NO_BUDGET'),
      setup.menuVisibility === 'NAMES' ? t('rounds.sharedMenu.NAMES') : null,
      setup.filRougeCategory ? t(`filRouge.category.${setup.filRougeCategory}`) : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const named = name.trim().length > 0

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('rounds.create')}</h1>
      {error && <div className="error">{error}</div>}

      <div>
        <label htmlFor="name">{t('rounds.name')}</label>
        <input id="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <p className="muted">{t('rounds.presets.lead')}</p>

      <div className="setups">
        {PRESETS.map((preset) => {
          const open = chosen === preset.key
          const manual = preset.key === 'MANUAL'
          return (
            <div key={preset.key} className={`setup${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="setup__face"
                aria-expanded={open}
                onClick={() => {
                  if (manual) {
                    // The long form is a place, not a panel: the name travels
                    // with it and the back link brings you here.
                    navigate('/rounds/new/custom', { state: { name } })
                    return
                  }
                  setChosen((cur) => (cur === preset.key ? null : preset.key))
                }}
              >
                <span className="setup__mark" aria-hidden="true">{preset.mark}</span>
                <span className="setup__name">{t(`rounds.presets.${preset.key}`)}</span>
                <span className="setup__what">{t(`rounds.presets.${preset.key}Hint`)}</span>
              </button>

              {open && !manual && (
                <div className="setup__body">
                  {/* The dice is rolled when it is pressed, so what it says
                      here is what it will make — press it again for another. */}
                  <p className="muted setup__summary">{summary(setupFor(preset))}</p>
                  <div className="row">
                    <button
                      type="button"
                      disabled={!named || submitting}
                      onClick={() => create(setupFor(preset))}
                    >
                      {t('rounds.createIt')}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        navigate('/rounds/new/custom', {
                          state: { name, setup: setupFor(preset) },
                        })
                      }
                    >
                      {t('rounds.presets.tweak')}
                    </button>
                  </div>
                  {!named && <p className="muted setup__summary">{t('rounds.presets.nameFirst')}</p>}
                </div>
              )}
            </div>
          )
        })}

        {/* The host's own, on the same shelf. */}
        {(mine ?? []).map((row) => {
          const open = chosen === row.id
          return (
            <div key={row.id} className={`setup setup--mine${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="setup__face"
                aria-expanded={open}
                onClick={() => setChosen((cur) => (cur === row.id ? null : row.id))}
              >
                <span className="setup__mark" aria-hidden="true">📋</span>
                <span className="setup__name">{row.name}</span>
                <span className="setup__what">{t('rounds.presets.mine')}</span>
              </button>

              {/* On the card, because that is where somebody looks for it —
                  and behind a confirm, because a saved table is four minutes
                  of somebody's evening and there is no undo. */}
              <button
                type="button"
                className="setup__remove"
                title={t('actions.remove')}
                aria-label={t('actions.remove')}
                onClick={() => setRemoving((cur) => (cur === row.id ? null : row.id))}
              >
                ×
              </button>

              {removing === row.id && (
                <div className="setup__body">
                  <InlineConfirm
                    title={t('rounds.presets.removeAsk', { name: row.name })}
                    confirmLabel={t('actions.remove')}
                    onConfirm={() => onDelete(row.id)}
                    onCancel={() => setRemoving(null)}
                  />
                </div>
              )}

              {open && removing !== row.id && (
                <div className="setup__body">
                  <p className="muted setup__summary">{summary(savedSetup(row))}</p>
                  <div className="row">
                    <button
                      type="button"
                      disabled={!named || submitting}
                      onClick={() => create(savedSetup(row))}
                    >
                      {t('rounds.createIt')}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        navigate('/rounds/new/custom', {
                          state: { name, setup: savedSetup(row) },
                        })
                      }
                    >
                      {t('rounds.presets.tweak')}
                    </button>
                  </div>
                  {!named && <p className="muted setup__summary">{t('rounds.presets.nameFirst')}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
