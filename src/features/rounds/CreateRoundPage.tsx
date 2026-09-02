import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Fold } from '../../components/Fold'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { ThemePicker } from './ThemePicker'
import { ChoiceList } from '../../components/ChoiceList'
import { DoorRules } from './DoorRules'
import { Link } from 'react-router-dom'
import {
  createRound,
  listNameThemes,
  listTableThemes,
  myProStatus,
  setCostSettings,
  toCents,
  PRO_REQUIRED,
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
// What a classic dinner is. `requiresApproval` is NOT in here any more: the
// door is asked of every host, classic or not, so its answer comes from the
// form rather than from this object — which would otherwise silently overwrite
// it. The default it used to carry lives on the useState below, where the
// other defaults are.
const CLASSIC = {
  access: 'CODE' as RoundAccess,
  anonymity: 'ANONYMOUS' as RoundAnonymity,
  slotMode: 'FREE' as SlotMode,
  votingMode: 'LIVE' as VotingMode,
}

// The order the questions are actually asked in, which is not the order the
// enum was written in. A table decides *whether phones come out* first — hands
// up or hands on screens — and only then how long the screens stay out for.
// DISABLED is last because it is the answer that ends the conversation.
const VOTING_ORDER: VotingMode[] = ['MANUAL', 'LIVE', 'TIMED', 'DISABLED']

// Cheapest commitment first in both: a code you can hand to anyone, then a
// guest list, then both. Undercover is the game as designed, and the two that
// give identity away follow it.
const ACCESS_ORDER: RoundAccess[] = ['CODE', 'INVITE', 'CODE_AND_INVITE']
const ANONYMITY_ORDER: RoundAnonymity[] = ['ANONYMOUS', 'SPY', 'OPEN']

// One is the game. Two and three are the same game with room to be kind to
// your cook — and they are what the PRO unlock actually buys.
const RECIPE_COUNTS = [1, 2, 3]

// Not the database's own `cost_mode`, which has two values: this is the
// question as a host is actually asked it, and "shared" splits into "with a
// number we agreed" and "without one". Both are cost_mode = SHARED; what
// separates them is whether budget_per_head is null.
type CostChoice = 'NONE' | 'BUDGET' | 'NO_BUDGET'
const COST_MODES: CostChoice[] = ['NONE', 'BUDGET', 'NO_BUDGET']

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
  const [requiresApproval, setRequiresApproval] = useState(true)
  const [votingMode, setVotingMode] = useState<VotingMode>(CLASSIC.votingMode)
  const [slotMode, setSlotMode] = useState<SlotMode>(CLASSIC.slotMode)
  // Shared costs (0065). Agreed here rather than at the end on purpose: a
  // budget set before the roulette shapes the recipes people write, and one
  // announced afterwards is a judgement passed on their receipts. Since 0074
  // this switch is also the *only* moment it can be thrown: turning sharing on
  // halfway through a dinner is a new deal, not a setting.
  const [costMode, setCostMode] = useState<CostChoice>('NONE')
  const [budget, setBudget] = useState('')
  const [recipesPerBrief, setRecipesPerBrief] = useState(1)
  // Null is "no cap", which is what the slider's far-right position means. One
  // value instead of a flag and a number, because they were one question.
  const [seats, setSeats] = useState<number | null>(8)
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

  // Read once here rather than inferred from the theme shelf: a host can own a
  // single theme without being PRO, and the recipe count is the other thing
  // PRO opens. The dinner is stamped with the answer at creation (0075), so
  // this is also the last moment it matters.
  const { data: pro } = useQuery({
    queryKey: ['pro', 'status'],
    queryFn: myProStatus,
    staleTime: 60 * 1000,
  })
  const isPro = pro?.pro ?? false
  // Set only while the free-for-all is on. Everything PRO is usable right now
  // and every PRO row still says so, with this date beside it — otherwise the
  // shelf looks like seven free cloths today and a theft in January.
  const freeUntil = pro?.window_open ? pro.window_until : null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const roundId = await createRound({
        name,
        ...(custom
          ? {
              access, anonymity, slotMode, votingMode, requiresApproval,
              nameTheme, tableTheme, recipesPerBrief,
            }
          : CLASSIC),
        // The door is asked of a classic host too, so its two answers have to
        // survive the CLASSIC spread above — otherwise the control would be on
        // the page, respond to being pressed, and be thrown away on submit.
        requiresApproval,
        maxPlayers: seats,
      })
      // A second call rather than four more arguments on create_round, which
      // already takes thirteen. The dinner exists either way; a budget that
      // failed to save is a setting to fix, not a dinner to lose.
      if (custom && costMode !== 'NONE') {
        await setCostSettings({
          roundId,
          mode: 'SHARED',
          // Null is a real answer here and not a missing one: it is what
          // "split it, with no ceiling" means all the way down to the column.
          budgetPerHead: costMode === 'BUDGET' ? toCents(budget) : null,
        })
      }
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
                <ChoiceList
                  name="access"
                  value={access}
                  onChange={(v) => setAccess(v as RoundAccess)}
                  options={ACCESS_ORDER.map((code) => ({
                    value: code,
                    label: t(`rounds.access.${code}`),
                    hint: t(`rounds.access.${code}Hint`),
                  }))}
                />
              </Fold>

              <Fold title={t('rounds.anonymity.label')} aside={t(`rounds.anonymity.${anonymity}`)}>
                <ChoiceList
                  name="anonymity"
                  value={anonymity}
                  onChange={(v) => setAnonymity(v as RoundAnonymity)}
                  options={ANONYMITY_ORDER.map((code) => ({
                    value: code,
                    label: t(`rounds.anonymity.${code}`),
                    hint: t(`rounds.anonymity.${code}Hint`),
                  }))}
                />
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
                  freeUntil={freeUntil}
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
                  freeUntil={freeUntil}
                />
              </Fold>

              {/* Shared costs. Labelled Pro because that is where it is headed,
                  and open today because there is nothing to buy yet: the day
                  there is, this is the switch that moves. Its home is this box
                  and not the other one — the *number* moves all evening, but
                  whether the table splits at all is agreed before anybody
                  shops (0074). */}
              {/* Three answers, not a tick and a hidden field. "Split it, no
                  ceiling" was reachable before — tick the box, leave the
                  budget empty — but only by discovering that an empty field
                  meant something, which is a rule you can only learn by
                  guessing right. Written out, it is a choice among three. */}
              <Fold title={t('costs.label')} aside={t(`costs.mode.${costMode}`)}>
                <ChoiceList
                  name="cost-mode"
                  value={costMode}
                  onChange={(v) => setCostMode(v as CostChoice)}
                  options={COST_MODES.map((code) => ({
                    value: code,
                    label: t(`costs.mode.${code}`),
                    hint: t(`costs.mode.${code}Hint`),
                  }))}
                />
                <p className="muted">{t('costs.shareFixed')}</p>
              </Fold>

              {/* HOW MANY IDEAS EACH SENDER MAY OFFER, and it belongs in this
                  box rather than the other one: raising it later would ask
                  people who have already finished writing to go back and write
                  again, and lowering it would throw away a recipe somebody
                  wrote for somebody.
                  What PRO buys here is more work for the sender and more room
                  for the cook — never an advantage over anybody at the table,
                  which is the line README draws around anything sellable. And
                  because the dinner carries its host's PRO (0075), every guest
                  writes three whether or not they have paid for anything. */}
              <Fold
                title={t('rounds.recipesPerBrief.label')}
                aside={t('rounds.recipesPerBrief.count', { count: recipesPerBrief })}
              >
                <ChoiceList
                  name="recipes-per-brief"
                  value={String(recipesPerBrief)}
                  onChange={(v) => setRecipesPerBrief(Number(v))}
                  options={RECIPE_COUNTS.map((n) => ({
                    value: String(n),
                    label: t('rounds.recipesPerBrief.count', { count: n }),
                    hint: t(`rounds.recipesPerBrief.hint${n}`),
                    locked: n > 1 && !isPro,
                    lockedReason: t('pro.lockedHere'),
                    // PRO, said whether or not it is currently locked. Same
                    // reason as the theme shelves: during the free-for-all
                    // these are usable, and a host who is never told they are
                    // a paid feature finds out by losing them.
                    tag:
                      n > 1 ? (
                        <>
                          <span className="shelf__tag shelf__tag--pro">{t('pro.badge')}</span>
                          {freeUntil && (
                            <em className="shelf__freenow">
                              {t('pro.freeForNow', {
                                date: new Date(freeUntil).toLocaleDateString(locale, {
                                  day: 'numeric',
                                  month: 'numeric',
                                }),
                              })}
                            </em>
                          )}
                        </>
                      ) : undefined,
                  }))}
                />
                {!isPro && (
                  <p className="muted">
                    <Link to="/pro">{t('pro.whatIsIt')}</Link>
                  </p>
                )}
              </Fold>

              {/* How many, and whether you wave them in. Both settled here
                  and nowhere else: there is no RPC that moves either on a live
                  round, which is exactly why they belong in this box. */}
              <DoorRules
                seats={seats}
                onSeats={setSeats}
                requiresApproval={requiresApproval}
                onRequiresApproval={setRequiresApproval}
              />
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
                {/* "No voting" no longer carries a red warning about being
                    irreversible. It was true — set_voting_mode refuses to turn
                    voting back on (0045) — and it was the only option on the
                    form that shouted, which made choosing a perfectly ordinary
                    kind of dinner feel like disarming something. A table that
                    does not want to rank its friends' cooking is not making a
                    mistake. The sentence under the option still says voting
                    stays off; it no longer says it in red. */}
                <ChoiceList
                  name="voting"
                  value={votingMode}
                  onChange={(v) => setVotingMode(v as VotingMode)}
                  options={VOTING_ORDER.map((mode) => ({
                    value: mode,
                    label: t(`rounds.voting.${mode}`),
                    hint: t(`rounds.voting.${mode}Hint`),
                  }))}
                />
              </Fold>

              <Fold title={t('rounds.slotMode.label')} aside={t(`rounds.slotMode.${slotMode}`)}>
                <ChoiceList
                  name="slot-mode"
                  value={slotMode}
                  onChange={(v) => setSlotMode(v as SlotMode)}
                  options={(['FREE', 'CATEGORIES'] as SlotMode[]).map((code) => ({
                    value: code,
                    label: t(`rounds.slotMode.${code}`),
                    hint: t(`rounds.slotMode.${code}Hint`),
                  }))}
                />
                {/* WHICH courses is not a question that can be answered here,
                    and saying so is the point. There has to be exactly one
                    course per chef, and the number of chefs is still moving —
                    every person who joins breaks the sum. So the mode is chosen
                    now and the menu is composed on the pass once sign-ups
                    close, which is the first moment the arithmetic holds
                    still. */}
                {slotMode === 'CATEGORIES' && (
                  <p className="muted">{t('rounds.slotMode.composedLater')}</p>
                )}
              </Fold>

              {/* The number, in the box of things that move — beside the
                  courses and the voting, and deliberately not beside the
                  switch that turned sharing on. */}
              {costMode === 'BUDGET' && (
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

            </section>

            <div className="profree">
              <p className="profree__head">{t('pro.title')}</p>
              <p className="profree__free">{t('pro.freeForever')}</p>
              <p className="profree__what">{t('pro.what')}</p>
              {/* The second of the two ways in, and the one that matters: this
                  is where somebody is looking at a locked row and wondering
                  what it would take. */}
              <p className="profree__link">
                <Link to="/pro">{t('pro.seeWhatItOpens')}</Link>
              </p>
            </div>
          </>
        )}

        {/* A classic dinner still gets a door — it is the one decision that
            is not about how the game is played, so keeping it here costs the
            "nothing to decide" promise nothing and losing it would take a
            capability away. Under `custom` it lives inside the fixed box
            instead, with the other things that cannot be changed. */}
        {!custom && (
          <DoorRules
            seats={seats}
            onSeats={setSeats}
            requiresApproval={requiresApproval}
            onRequiresApproval={setRequiresApproval}
          />
        )}

        <button type="submit" disabled={submitting}>
          {t('actions.submit')}
        </button>
      </form>
    </div>
  )
}
