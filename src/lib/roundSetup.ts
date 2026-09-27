import {
  createRound,
  setCostSettings,
  setMenuVisibility,
  toCents,
  type FilRougeCategory,
  type FilRougeScope,
  type MenuVisibility,
  type NameTheme,
  type RoundAccess,
  type RoundAnonymity,
  type SlotMode,
  type TableTheme,
  type VotingMode,
} from './rpc'

/**
 * EVERY DECISION A DINNER IS MADE OF, IN ONE OBJECT.
 *
 * It exists because there are now three ways to arrive at the same dinner —
 * a card on the grid, a saved card of your own, or the long form — and before
 * this they were three copies of the same fifteen fields. A copy is how the
 * form and the presets drift apart: somebody adds a setting to the form, the
 * cards keep making dinners without it, and nobody finds out until a host asks
 * why "party" dinners have no thread.
 *
 * Two of these are not columns on `rounds` and cannot be: shared costs are set
 * by their own RPC (0065) and the menu's visibility by another (0087). They
 * still belong here, because they are part of what somebody means when they
 * say "a party dinner" — `applySetup` is what knows they take three calls.
 */
export interface RoundSetup {
  access: RoundAccess
  anonymity: RoundAnonymity
  requiresApproval: boolean
  /** Null is no cap at all — the far-right position of the seats slider. */
  seats: number | null
  slotMode: SlotMode
  votingMode: VotingMode
  nameTheme: NameTheme
  tableTheme: TableTheme
  recipesPerBrief: number
  filRougeCategory: FilRougeCategory | null
  filRougeCode: string | null
  filRougeScope: FilRougeScope
  /** NONE, or shared — with a ceiling agreed now, or without one. */
  costMode: 'NONE' | 'BUDGET' | 'NO_BUDGET'
  /** Typed by a person, so a string: '12.50'. Empty unless costMode is BUDGET. */
  budget: string
  menuVisibility: MenuVisibility
}

/** The dinner this app is about, with nothing decided: a covered table, one
 *  recipe each, a code to share, and a vote at the end. */
export const DEFAULT_SETUP: RoundSetup = {
  access: 'CODE',
  anonymity: 'ANONYMOUS',
  requiresApproval: true,
  // No cap unless the host sets one in the long form: a proposed dinner
  // should not decide how many friends somebody has.
  seats: null,
  slotMode: 'FREE',
  votingMode: 'LIVE',
  nameTheme: 'FOOD',
  tableTheme: 'CHECKS',
  recipesPerBrief: 1,
  filRougeCategory: null,
  filRougeCode: null,
  filRougeScope: 'SHARED',
  costMode: 'NONE',
  budget: '',
  menuVisibility: 'HIDDEN',
}

/** The cards on the grid. `QUESTIONS` opens the four questions in place and
 *  `MANUAL` the long form; neither creates anything by itself. */
export type PresetKey = 'CLASSIC' | 'QUESTIONS' | 'MANUAL' | 'FOR_SOMEONE'

export interface Preset {
  key: PresetKey
  /** Only a card that IS a fixed set of answers carries one. */
  setup?: RoundSetup
  /** On the grid, shut, marked as coming: it needs something the app does not
   *  do yet. */
  soon?: boolean
}

/**
 * THE GAME, FOUR QUESTIONS, AND THE DOOR.
 *
 * The grid used to be six moods — "party", "no stress", "no surprises", a dice
 * — and each one left the host to work out what it set. Now there is the game
 * as designed, one card that asks about the evening instead of naming it, and
 * the long form. The moods are not lost: every one of them is an answer to the
 * questions below.
 *
 * FOR SOMEONE is the one evening the questions cannot reach: a party where the
 * table plans behind the back of the person it is for. That needs a space the
 * guest of honour cannot see, which the app does not have yet, so the card is
 * on the grid, shut.
 *
 * THE COSTS ARE SPLIT WITHOUT A CEILING on the classic card, and that is not
 * laziness: a card cannot invent a number that means anything to your table,
 * and a budget is the one setting that can still be agreed after the dinner
 * exists (0074). The questions ask for the number instead.
 */
export const PRESETS: Preset[] = [
  {
    key: 'CLASSIC',
    setup: {
      ...DEFAULT_SETUP,
      access: 'CODE_AND_INVITE',
      anonymity: 'ANONYMOUS',
      requiresApproval: true,
      slotMode: 'CATEGORIES',
      votingMode: 'LIVE',
      costMode: 'NO_BUDGET',
    },
  },
  { key: 'QUESTIONS' },
  { key: 'MANUAL' },
  { key: 'FOR_SOMEONE', soon: true },
]

/**
 * FOUR QUESTIONS ABOUT THE EVENING, NOT ABOUT THE SETTINGS.
 *
 * Each answer moves one or two fields that already exist; everything else stays
 * at `DEFAULT_SETUP`. None of them turns the chain off — who cooks for whom is
 * secret in every dinner, whatever the answers — so the first question is about
 * NAMES, which is what `anonymity` actually decides.
 */
export interface EventAnswers {
  /** Code names until the reveal, or everybody's own name. */
  codeNames: boolean
  /** A meal in courses, or a buffet where everybody brings what they like. */
  courses: boolean
  /** Dish names readable while the recipes are being written. */
  menuVisible: boolean
  costs: 'OWN' | 'SHARED' | 'BUDGET'
  /** Typed by a person: '15' or '12.50'. Only read when costs is BUDGET. */
  budget: string
}

/** What the two answers that change the evening most add up to. */
export type EventKind = 'UNDERCOVER' | 'SURPRISE_BUFFET' | 'FRIENDS' | 'PICNIC'

export function eventKind(a: Pick<EventAnswers, 'codeNames' | 'courses'>): EventKind {
  if (a.codeNames) return a.courses ? 'UNDERCOVER' : 'SURPRISE_BUFFET'
  return a.courses ? 'FRIENDS' : 'PICNIC'
}

export function setupFromAnswers(a: EventAnswers): RoundSetup {
  return {
    ...DEFAULT_SETUP,
    anonymity: a.codeNames ? 'ANONYMOUS' : 'OPEN',
    slotMode: a.courses ? 'CATEGORIES' : 'FREE',
    menuVisibility: a.menuVisible ? 'NAMES' : 'HIDDEN',
    costMode: a.costs === 'OWN' ? 'NONE' : a.costs === 'SHARED' ? 'NO_BUDGET' : 'BUDGET',
    budget: a.costs === 'BUDGET' ? a.budget : '',
  }
}

/**
 * Making the dinner: one create, and the two settings that live behind their
 * own RPCs.
 *
 * The two extra calls are deliberately NOT folded into create_round, which
 * already takes seventeen arguments. The dinner exists after the first call;
 * a cost setting that failed is a thing to fix on the round page, not a reason
 * to have no dinner.
 */
export async function applySetup(name: string, setup: RoundSetup): Promise<string> {
  const roundId = await createRound({
    name,
    access: setup.access,
    anonymity: setup.anonymity,
    slotMode: setup.slotMode,
    votingMode: setup.votingMode,
    requiresApproval: setup.requiresApproval,
    maxPlayers: setup.seats,
    nameTheme: setup.nameTheme,
    tableTheme: setup.tableTheme,
    recipesPerBrief: setup.recipesPerBrief,
    filRougeCategory: setup.filRougeCategory,
    filRougeCode: setup.filRougeScope === 'SHARED' ? setup.filRougeCode : null,
    filRougeScope: setup.filRougeScope,
  })

  if (setup.costMode !== 'NONE') {
    await setCostSettings({
      roundId,
      mode: 'SHARED',
      // Null is a real answer here and not a missing one: it is what "split it,
      // with no ceiling" means all the way down to the column.
      budgetPerHead: setup.costMode === 'BUDGET' ? toCents(setup.budget) : null,
    })
  }

  if (setup.menuVisibility !== 'HIDDEN') {
    await setMenuVisibility(roundId, setup.menuVisibility)
  }

  return roundId
}
