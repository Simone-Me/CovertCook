import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Fold } from '../../components/Fold'
import { useAuth } from '../../lib/auth'
import { ThemePicker } from './ThemePicker'
import { FilRougePicker } from './FilRougePicker'
import { useFilRougeLabel } from '../../lib/filRouge'
import { ChoiceList } from '../../components/ChoiceList'
import { DoorRules } from './DoorRules'
import { BackToTable } from '../../components/BackToTable'
import {
  applySetup,
  DEFAULT_SETUP,
  type RoundSetup,
} from '../../lib/roundSetup'
import {
  listNameThemes,
  listTableThemes,
  myProStatus,
  saveSetup,
  PRO_REQUIRED,
  THEME_LOCKED,
  TOO_MANY_PRESETS,
  type RoundAccess,
  type RoundAnonymity,
  type SlotMode,
  type VotingMode,
  type NameTheme,
  type TableTheme,
  FIL_ROUGE_SEALED,
  type FilRougeCategory,
  type FilRougeScope,
} from '../../lib/rpc'

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
// your cook — and they are what Crème actually buys.
const RECIPE_COUNTS = [1, 2, 3]

// Not the database's own `cost_mode`, which has two values: this is the
// question as a host is actually asked it, and "shared" splits into "with a
// number we agreed" and "without one". Both are cost_mode = SHARED; what
// separates them is whether budget_per_head is null.
type CostChoice = RoundSetup['costMode']
const COST_MODES: CostChoice[] = ['NONE', 'BUDGET', 'NO_BUDGET']

/**
 * THE LONG FORM, ON ITS OWN PAGE.
 *
 * It used to be the second half of the creation screen, hidden behind a radio
 * button: choose "customise" and eleven folds unrolled underneath the two
 * lines you had already read. That was fine when the form was seven settings
 * and it stopped being fine at fifteen — the page you had arrived at ("make me
 * a dinner") and the page you were now on ("decide everything about a dinner")
 * were two different jobs pretending to be one screen, and the scroll position
 * was the only thing that told you which one you were doing.
 *
 * So the grid is the door and this is the room behind it. Arriving here is a
 * deliberate act, the name you already typed travels with you, and going back
 * is a link rather than a radio button you have to find again.
 *
 * WHAT IS FIXED AND WHAT IS NOT is said twice, and neither is decoration: the
 * line at the top says everything here is settled for good, and the green box
 * at the foot holds the two that are not. They were mixed in with the rest for
 * one version and it was a mistake — "changeable" is the first thing somebody
 * wants to know about a setting they are unsure of, and a sentence under the
 * control does not carry as far as a box of its own.
 */
export function CustomRoundPage() {
  const { t, i18n } = useTranslation()
  const filRougeLabel = useFilRougeLabel()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const locale = profile?.locale ?? i18n.language ?? 'en'

  // What the grid was holding when somebody pressed "configure it myself": the
  // name they had typed, and — when they opened a card to look inside it —
  // the answers that card carries.
  const arrived = (location.state ?? {}) as { name?: string; setup?: RoundSetup }
  const start: RoundSetup = { ...DEFAULT_SETUP, ...(arrived.setup ?? {}) }

  const [name, setName] = useState(arrived.name ?? '')
  const [nameTheme, setNameTheme] = useState<NameTheme>(start.nameTheme)
  const [tableTheme, setTableTheme] = useState<TableTheme>(start.tableTheme)
  const [access, setAccess] = useState<RoundAccess>(start.access)
  const [anonymity, setAnonymity] = useState<RoundAnonymity>(start.anonymity)
  const [requiresApproval, setRequiresApproval] = useState(start.requiresApproval)
  const [votingMode, setVotingMode] = useState<VotingMode>(start.votingMode)
  const [slotMode, setSlotMode] = useState<SlotMode>(start.slotMode)
  // Shared costs (0065). Agreed here rather than at the end on purpose: a
  // budget set before the roulette shapes the recipes people write, and one
  // announced afterwards is a judgement passed on their receipts. Since 0074
  // this switch is also the *only* moment it can be thrown: turning sharing on
  // halfway through a dinner is a new deal, not a setting.
  const [costMode, setCostMode] = useState<CostChoice>(start.costMode)
  const [budget, setBudget] = useState(start.budget)
  const [recipesPerBrief, setRecipesPerBrief] = useState(start.recipesPerBrief)
  // The thread the whole table cooks against (0085).
  const [filRouge, setFilRouge] = useState<{
    category: FilRougeCategory | null
    code: string | null
    scope: FilRougeScope
  }>({
    category: start.filRougeCategory,
    code: start.filRougeCode,
    scope: start.filRougeScope,
  })
  // Null is "no cap", which is what the slider's far-right position means. One
  // value instead of a flag and a number, because they were one question.
  const [seats, setSeats] = useState<number | null>(start.seats)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Saving these answers under a name, so the grid carries them next time.
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)

  // The catalogue, with "may I use this" already answered by the server (0072).
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
  // single theme without being Crème, and the recipe count is the other thing
  // Crème opens. The dinner is stamped with the answer at creation (0075), so
  // this is also the last moment it matters.
  const { data: pro } = useQuery({
    queryKey: ['pro', 'status'],
    queryFn: myProStatus,
    staleTime: 60 * 1000,
  })
  const isPro = pro?.pro ?? false
  // Set only while the free-for-all is on. Everything Crème is usable right now
  // and every Crème row still says so, with this date beside it — otherwise the
  // shelf looks like seven free cloths today and a theft in January.
  const freeUntil = pro?.window_open ? pro.window_until : null

  /** Everything on this form, as the one object the grid and the saver both
   *  speak. Read at the moment it is needed rather than held in a second copy
   *  that could drift from the controls above. */
  function current(): RoundSetup {
    return {
      access,
      anonymity,
      requiresApproval,
      seats,
      slotMode,
      votingMode,
      nameTheme,
      tableTheme,
      recipesPerBrief,
      filRougeCategory: filRouge.category,
      filRougeCode: filRouge.code,
      filRougeScope: filRouge.scope,
      costMode,
      budget,
      // Not on this form: a dinner whose menu is readable while it is written
      // is a decision taken on the dinner itself, where it can also be undone
      // (0087). Carried through so a saved card keeps whatever it arrived with.
      menuVisibility: start.menuVisibility,
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const roundId = await applySetup(name, current())
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

  async function onSave() {
    if (!profile?.id || !saveName.trim()) return
    setError(null)
    try {
      await saveSetup(profile.id, saveName, current())
      await queryClient.invalidateQueries({ queryKey: ['saved-setups'] })
      setSaved(true)
      setSaveName('')
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw.includes(TOO_MANY_PRESETS) ? t('rounds.presets.tooMany') : raw || t('errors.generic'))
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('rounds.setup.custom')}</h1>
      {error && <div className="error">{error}</div>}

      <form onSubmit={onSubmit} className="stack">
        <div>
          <label htmlFor="name">{t('rounds.name')}</label>
          <input id="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <p className="muted rules__warn">{t('rounds.rules.settled')}</p>

        <section className="rules rules--group">
          <header className="rules__head">
            <h2 className="rules__title">{t('rounds.group.chefs')}</h2>
            <p className="rules__note">{t('rounds.group.chefsHint')}</p>
          </header>

          <Fold
            title={t('rounds.group.invitation')}
            hint={t('rounds.access.label')}
            aside={t(`rounds.access.${access}`)}
          >
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

          {/* How many, and whether you wave them in. Both settled here
              and nowhere else: there is no RPC that moves either on a live
              round. */}
          <DoorRules
            seats={seats}
            onSeats={setSeats}
            requiresApproval={requiresApproval}
            onRequiresApproval={setRequiresApproval}
          />

          <Fold
            title={t('rounds.group.covert')}
            hint={t('rounds.anonymity.label')}
            aside={t(`rounds.anonymity.${anonymity}`)}
          >
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
        </section>

        <section className="rules rules--group">
          <header className="rules__head">
            <h2 className="rules__title">{t('rounds.group.theme')}</h2>
            <p className="rules__note">{t('rounds.group.themeHint')}</p>
          </header>

          {/* Le fil rouge: the one thing on this form that tells a host
              what the evening will be ABOUT rather than how it will run.
              First in this group because it is not a look — it changes
              what gets cooked, which is why it is free. */}
          <Fold
            title={t('rounds.group.topic')}
            hint={t('filRouge.label')}
            aside={
              filRouge.category === null
                ? t('filRouge.none')
                : filRouge.scope === 'PER_COOK'
                  ? t(`filRouge.category.${filRouge.category}`)
                  : // A sealed draw has no name to print, which is the
                    // whole of what it is (0089).
                    filRouge.code === FIL_ROUGE_SEALED
                    ? t('filRouge.compass')
                    : filRouge.code
                      ? filRougeLabel(filRouge.category, filRouge.code)
                      : t(`filRouge.category.${filRouge.category}`)
            }
          >
            <p className="muted">{t('filRouge.explain')}</p>
            <FilRougePicker
              category={filRouge.category}
              code={filRouge.code}
              scope={filRouge.scope}
              onChange={setFilRouge}
            />
          </Fold>

          {/* The word list, and the mark that comes with it: the same glyph
              stands for the dinner and gives every chef their face in the
              fridge, so choosing a list is choosing a look as well as a
              vocabulary. */}
          <Fold
            title={t('rounds.group.pseudonym')}
            hint={t('rounds.nameTheme.label')}
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
            title={t('rounds.group.design')}
            hint={t('rounds.tableTheme.label')}
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
        </section>

        <section className="rules rules--group">
          <header className="rules__head">
            <h2 className="rules__title">{t('rounds.group.recipe')}</h2>
            <p className="rules__note">{t('rounds.group.recipeHint')}</p>
          </header>

          {/* HOW MANY IDEAS EACH SENDER MAY OFFER. Raising it later would
              ask people who have already finished writing to go back and
              write again, and lowering it would throw away a recipe
              somebody wrote for somebody — so it is settled here.
              What Crème buys is more work for the sender and more room for
              the cook — never an advantage over anybody at the table, which
              is the line README draws around anything sellable. And because
              the dinner carries its host's Crème (0075), every guest writes
              three whether or not they have paid for anything. */}
          <Fold
            title={t('rounds.group.multiple')}
            hint={t('rounds.recipesPerBrief.label')}
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
                // Crème, said whether or not it is currently locked. Same
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
            {/* NO SECOND LINK TO CRÈME HERE. The foot of this form already
                carries one, and a row with its own link taught people that
                three recipes were a separate thing to go and buy — which
                stopped being true the day Crème became one price for
                everything. One way in, at the bottom, for the whole form. */}
          </Fold>

          {/* WHETHER THE TABLE SPLITS, AND FOR HOW MUCH, IN ONE PLACE.
              They were two folds in two different boxes, because they obey
              two different rules — whether costs are shared is agreed
              before anybody shops and never moves (0074), while the number
              moves all evening. True, and unhelpful: a host setting a
              budget had to find the second half of their own decision
              under a different heading. One fold, and the half that can
              still move says so in the line under it. */}
          <Fold
            title={t('rounds.group.budget')}
            hint={t('costs.label')}
            aside={
              costMode === 'BUDGET' && budget
                ? budget
                : t(`costs.mode.${costMode}`)
            }
          >
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

            {costMode === 'BUDGET' && (
              <div className="stack">
                <label htmlFor="budget">{t('costs.budgetPerHead')}</label>
                <input
                  id="budget"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
                <p className="muted">{t('costs.budgetHint')}</p>
                {/* The one line of this kind left in the fixed groups, and it
                    earns it: WHETHER the table splits is settled here for
                    good, while the number itself moves all evening (0074).
                    Two rules in one fold, so the half that can still move says
                    so where it is typed. */}
                <p className="muted small-italic">{t('rounds.rules.liveMark')}</p>
              </div>
            )}
          </Fold>

        </section>


        {/* THE TWO THAT ARE NOT SETTLED, IN A BOX OF THEIR OWN AND IN GREEN.
            They spent one version inside the recipe group with a line of
            italics under each — which is where they belong by subject and not
            where they belong by consequence. "Can I change my mind about this
            later?" is the first question somebody has about a setting they are
            unsure of, and a box answers it before they have to read anything.
            The turning arrow ↺ on the pass is what comes back to them. */}
        <section className="rules rules--live">
          <header className="rules__head">
            <h2 className="rules__title">{t('rounds.rules.liveTitle')}</h2>
            <p className="rules__note">{t('rounds.rules.liveNote')}</p>
          </header>

            <Fold
              title={t('rounds.group.courses')}
              hint={t('rounds.slotMode.label')}
              aside={t(`rounds.slotMode.${slotMode}`)}
            >
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

            <Fold
              title={t('rounds.group.vote')}
              hint={t('rounds.voting.label')}
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
        </section>

        {/* What Crème is, in the same shape and the same words the account page
            uses (0075). One line, one chip, and it lights up when you touch
            it — a paragraph in a dashed box was a notice, and this is a door. */}
        <Link to="/pro" className="pass__link">
          <span className="pro-chip" aria-hidden="true">{t('pro.badge')}</span>
          <span>
            <strong>{t(isPro ? 'pro.status.on' : 'pro.status.off')}</strong>
            {' — '}
            {t('pro.seeWhatItOpens')}
          </span>
        </Link>

        {/* KEEPING THIS TABLE. A host who has just spent four minutes deciding
            fifteen things is the one person who knows whether they will want
            them again, and this is the moment to ask — not a settings page
            they would have to go looking for afterwards. The card lands on the
            grid, under the four the app ships. */}
        <div className="card stack">
          <strong>{t('rounds.presets.saveTitle')}</strong>
          <p className="muted" style={{ margin: 0 }}>{t('rounds.presets.saveWhat')}</p>
          <div className="row">
            <input
              id="preset-name"
              maxLength={40}
              placeholder={t('rounds.presets.namePlaceholder')}
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value)
                setSaved(false)
              }}
            />
            <button type="button" className="secondary" disabled={!saveName.trim()} onClick={onSave}>
              {t('rounds.presets.save')}
            </button>
          </div>
          {saved && <p className="muted" style={{ margin: 0 }}>{t('rounds.presets.saved')}</p>}
        </div>

        <button type="submit" disabled={submitting}>
          {t('rounds.createIt')}
        </button>
      </form>
    </div>
  )
}
