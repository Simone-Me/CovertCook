import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Fold } from '../../components/Fold'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { ThemePicker } from './ThemePicker'
import {
  createRound,
  listNameThemes,
  listTableThemes,
  setCostSettings,
  toCents,
  THEME_LOCKED,
  type RoundAccess,
  type RoundAnonymity,
  type SlotMode,
  type VotingMode,
  type NameTheme,
  type TableTheme,
} from '../../lib/rpc'

// Classic is the whole product with nothing to decide: a covered dinner,
// one recipe each, voting on. Custom opens the rest. This is the "default
// to simple" principle from README.md made literal — most hosts should
// never see a radio button.
// Kept in step with rounds_max_players_sane (0020). Three is where a chain
// stops being a swap; thirty is where the secret-name list runs out and
// people start being numbered instead of named.
const MIN_PLAYERS = 3
const MAX_PLAYERS = 30

const CLASSIC = {
  access: 'CODE' as RoundAccess,
  anonymity: 'ANONYMOUS' as RoundAnonymity,
  slotMode: 'FREE' as SlotMode,
  votingMode: 'LIVE' as VotingMode,
  requiresApproval: true,
}

// The order the questions are actually asked in, which is not the order the
// enum was written in. A table decides *whether phones come out* first — hands
// up or hands on screens — and only then how long the screens stay out for.
// DISABLED is last because it is the answer that ends the conversation.
const VOTING_ORDER: VotingMode[] = ['MANUAL', 'LIVE', 'TIMED', 'DISABLED']

export function CreateRoundPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const locale = profile?.locale ?? i18n.language ?? 'en'

  const [name, setName] = useState('')
  const [custom, setCustom] = useState(false)
  const [nameTheme, setNameTheme] = useState<NameTheme>('FOOD')
  const [tableTheme, setTableTheme] = useState<TableTheme>('CHECKS')
  const [access, setAccess] = useState<RoundAccess>(CLASSIC.access)
  const [anonymity, setAnonymity] = useState<RoundAnonymity>(CLASSIC.anonymity)
  const [requiresApproval, setRequiresApproval] = useState(CLASSIC.requiresApproval)
  const [votingMode, setVotingMode] = useState<VotingMode>(CLASSIC.votingMode)
  const [slotMode, setSlotMode] = useState<SlotMode>(CLASSIC.slotMode)
  // Shared costs (0065). Agreed here rather than at the end on purpose: a
  // budget set before the roulette shapes the recipes people write, and one
  // announced afterwards is a judgement passed on their receipts. Since 0074
  // this switch is also the *only* moment it can be thrown: turning sharing on
  // halfway through a dinner is a new deal, not a setting.
  const [shareCosts, setShareCosts] = useState(false)
  const [budget, setBudget] = useState('')
  const [limitPlayers, setLimitPlayers] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // The catalogue, with "may I use this" already answered by the server
  // (0072). Fetched even on a classic dinner because the two containers below
  // are only rendered under `custom` — the query is cheap, static, and shared
  // by both pickers.
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const roundId = await createRound({
        name,
        ...(custom
          ? { access, anonymity, slotMode, votingMode, requiresApproval, nameTheme, tableTheme }
          : CLASSIC),
        maxPlayers: limitPlayers ? maxPlayers : null,
      })
      // A second call rather than four more arguments on create_round, which
      // already takes thirteen. The dinner exists either way; a budget that
      // failed to save is a setting to fix, not a dinner to lose.
      if (custom && shareCosts) {
        await setCostSettings({
          roundId,
          mode: 'SHARED',
          budgetPerHead: toCents(budget),
        })
      }
      navigate(`/rounds/${roundId}`, { replace: true })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === THEME_LOCKED ? t('themes.locked') : raw || t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stack sheet">
      <h1>{t('rounds.create')}</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div>
          <label htmlFor="name">{t('rounds.name')}</label>
          <input id="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="card stack">
          <label className="row">
            <input
              type="radio"
              style={{ width: 'auto' }}
              checked={!custom}
              onChange={() => setCustom(false)}
            />
            <span>
              <strong>{t('rounds.setup.classic')}</strong>
              <span className="muted"> — {t('rounds.setup.classicHint')}</span>
            </span>
          </label>
          <label className="row">
            <input
              type="radio"
              style={{ width: 'auto' }}
              checked={custom}
              onChange={() => setCustom(true)}
            />
            <span>
              <strong>{t('rounds.setup.custom')}</strong>
              <span className="muted"> — {t('rounds.setup.customHint')}</span>
            </span>
          </label>
        </div>

        {custom && (
          <>
            {/* TWO CONTAINERS, AND THE DIVIDING LINE IS THE ONLY THING THAT
                MATTERS ON THIS SCREEN.
                Seven settings in one folded stack said nothing about which of
                them a host was committing to. Some of these can be revisited
                over dinner with the turning arrow; the rest cannot be
                revisited at all, because changing them would rewrite an
                evening under the people living it — renaming everybody
                mid-game, or telling a table that has already shopped that
                costs are being split after all.
                So the two kinds are two boxes, in different colours, and the
                one you cannot undo says so in its own heading rather than in a
                footnote under each control. */}
            <section className="rules rules--fixed">
              <header className="rules__head">
                <h2 className="rules__title">{t('rounds.rules.fixedTitle')}</h2>
                <p className="rules__warn">{t('rounds.rules.fixedWarn')}</p>
              </header>

              <Fold title={t('rounds.access.label')} aside={t(`rounds.access.${access}`)}>
                <select
                  aria-label={t('rounds.access.label')}
                  value={access}
                  onChange={(e) => setAccess(e.target.value as RoundAccess)}
                >
                  <option value="CODE">{t('rounds.access.CODE')}</option>
                  <option value="INVITE">{t('rounds.access.INVITE')}</option>
                  <option value="CODE_AND_INVITE">{t('rounds.access.CODE_AND_INVITE')}</option>
                </select>
                <p className="muted">{t(`rounds.access.${access}Hint`)}</p>
              </Fold>

              <Fold title={t('rounds.anonymity.label')} aside={t(`rounds.anonymity.${anonymity}`)}>
                <select
                  aria-label={t('rounds.anonymity.label')}
                  value={anonymity}
                  onChange={(e) => setAnonymity(e.target.value as RoundAnonymity)}
                >
                  <option value="ANONYMOUS">{t('rounds.anonymity.ANONYMOUS')}</option>
                  <option value="SPY">{t('rounds.anonymity.SPY')}</option>
                  <option value="OPEN">{t('rounds.anonymity.OPEN')}</option>
                </select>
                <p className="muted">{t(`rounds.anonymity.${anonymity}Hint`)}</p>
              </Fold>

              {/* The word list, and the mark that comes with it: the same glyph
                  stands for the dinner and gives every chef their face in the
                  fridge, so choosing a list is choosing a look as well as a
                  vocabulary. */}
              <Fold
                title={t('rounds.nameTheme.label')}
                aside={t(`rounds.nameTheme.${nameTheme}`, { defaultValue: nameTheme })}
              >
                <ThemePicker
                  name="name-theme"
                  options={nameThemes}
                  value={nameTheme}
                  onChange={(code) => setNameTheme(code as NameTheme)}
                  labelKey="rounds.nameTheme"
                  locale={locale}
                />
              </Fold>

              <Fold
                title={t('rounds.tableTheme.label')}
                aside={t(`rounds.tableTheme.${tableTheme}`, { defaultValue: tableTheme })}
              >
                <ThemePicker
                  name="table-theme"
                  options={tableThemes}
                  value={tableTheme}
                  onChange={(code) => setTableTheme(code as TableTheme)}
                  labelKey="rounds.tableTheme"
                  locale={locale}
                />
              </Fold>

              {/* Shared costs. Labelled Pro because that is where it is headed,
                  and open today because there is nothing to buy yet: the day
                  there is, this is the switch that moves. Its home is this box
                  and not the other one — the *number* moves all evening, but
                  whether the table splits at all is agreed before anybody
                  shops (0074). */}
              <Fold
                title={t('costs.label')}
                aside={shareCosts ? t('costs.on') : t('pro.badge')}
              >
                <label className="row">
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={shareCosts}
                    onChange={(e) => setShareCosts(e.target.checked)}
                  />
                  <span>{t('costs.share')}</span>
                </label>
                <p className="muted">{t('costs.shareFixed')}</p>
              </Fold>

              <label className="row">
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                />
                {t('rounds.requiresApproval')}
              </label>
            </section>

            <section className="rules rules--live">
              <header className="rules__head">
                <h2 className="rules__title">{t('rounds.rules.liveTitle')}</h2>
                <p className="rules__note">{t('rounds.rules.liveNote')}</p>
              </header>

              <Fold
                title={t('rounds.voting.label')}
                aside={t(`rounds.voting.${votingMode}`)}
              >
                <select
                  aria-label={t('rounds.voting.label')}
                  value={votingMode}
                  onChange={(e) => setVotingMode(e.target.value as VotingMode)}
                >
                  {VOTING_ORDER.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`rounds.voting.${mode}`)}
                    </option>
                  ))}
                </select>
                {/* The one setting in this box with no way back: advance_phase
                    refuses to enter VOTING at all on a DISABLED round, on
                    purpose, and set_voting_mode refuses to turn it back on
                    (0045). Saying so here is cheaper than a support question
                    later. */}
                <p className={votingMode === 'DISABLED' ? 'error' : 'muted'}>
                  {t(`rounds.voting.${votingMode}Hint`)}
                </p>
              </Fold>

              <Fold title={t('rounds.slotMode.label')} aside={t(`rounds.slotMode.${slotMode}`)}>
                <select
                  aria-label={t('rounds.slotMode.label')}
                  value={slotMode}
                  onChange={(e) => setSlotMode(e.target.value as SlotMode)}
                >
                  <option value="FREE">{t('rounds.slotMode.FREE')}</option>
                  <option value="CATEGORIES">{t('rounds.slotMode.CATEGORIES')}</option>
                </select>
                <p className="muted">{t('rounds.slotMode.changeable')}</p>
              </Fold>

              {/* The number, in the box of things that move — beside the
                  courses and the voting, and deliberately not beside the
                  switch that turned sharing on. */}
              {shareCosts && (
                <Fold title={t('costs.budgetPerHead')} aside={budget || t('costs.noCeiling')}>
                  <label htmlFor="budget">{t('costs.budgetPerHead')}</label>
                  <input
                    id="budget"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                  <p className="muted">{t('costs.budgetHint')}</p>
                </Fold>
              )}

              <Fold title={t('rounds.recipesPerBrief.label')} aside={t('pro.badge')}>
                <select aria-label={t('rounds.recipesPerBrief.label')} disabled value="1" onChange={() => {}}>
                  <option value="1">{t('rounds.recipesPerBrief.one')}</option>
                </select>
                <p className="muted">{t('rounds.comingSoon')}</p>
              </Fold>
            </section>

            <div className="profree">
              <p className="profree__head">{t('pro.title')}</p>
              <p className="profree__free">{t('pro.freeForever')}</p>
              <p className="profree__what">{t('pro.what')}</p>
            </div>
          </>
        )}

        <label className="row">
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={limitPlayers}
            onChange={(e) => setLimitPlayers(e.target.checked)}
          />
          {t('rounds.limitPlayers')}
        </label>

        {limitPlayers && (
          <div>
            <label htmlFor="maxPlayers">{t('rounds.maxPlayers')}</label>
            <input
              id="maxPlayers"
              type="number"
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              required
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
            {/* Mirrors the rounds_max_players_sane constraint (0020) so the
                limit is explained here rather than discovered as a raw
                Postgres error after the click. */}
            {maxPlayers > MAX_PLAYERS && <p className="error">{t('rounds.tooManyPlayers')}</p>}
            {maxPlayers < MIN_PLAYERS && <p className="error">{t('rounds.tooFewPlayers')}</p>}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || (limitPlayers && (maxPlayers > MAX_PLAYERS || maxPlayers < MIN_PLAYERS))}
        >
          {t('actions.submit')}
        </button>
      </form>
    </div>
  )
}
