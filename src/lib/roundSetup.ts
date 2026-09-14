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
  seats: 8,
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

/** The cards on the grid. `MANUAL` opens the long form instead of creating
 *  anything; `RANDOM` is rolled at the moment it is pressed. */
export type PresetKey = 'CLASSIC' | 'PARTY' | 'NO_SURPRISES' | 'NO_STRESS' | 'RANDOM' | 'MANUAL'

export interface Preset {
  key: PresetKey
  /** Absent for the two cards that are not a fixed set of answers. */
  setup?: RoundSetup
}

/**
 * FOUR TABLES, A DICE AND A DOOR.
 *
 * Every card here is a dinner somebody actually described wanting, and the
 * differences between them are the ones that change the evening rather than
 * the ones that are easy to write down:
 *
 *  · CLASSIC is the game as designed — covered, approved at the door, one
 *    course each so the menu is composed, and the costs split.
 *  · PARTY opens everything that makes a table louder: no cap on the seats,
 *    the menu readable while it is being written (so nobody brings the third
 *    tiramisù), a cloth and a word list drawn at random, and courses.
 *  · NO SURPRISES is the dinner for people who do not want a game: everybody
 *    knows everybody, the menu is visible, the costs are split and the door is
 *    a guest list.
 *  · NO STRESS is the opposite of a checklist — covered, a code, no cap, no
 *    thread, no courses to compose and no money to talk about.
 *
 * THE COSTS ARE SPLIT WITHOUT A CEILING wherever a card splits them, and that
 * is not laziness: a card cannot invent a number that means anything to your
 * table, and a budget is the one setting that can still be agreed after the
 * dinner exists (0074). The card turns the sharing on; the table says how much.
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
  {
    key: 'PARTY',
    setup: {
      ...DEFAULT_SETUP,
      seats: null,
      requiresApproval: false,
      slotMode: 'CATEGORIES',
      costMode: 'NO_BUDGET',
      menuVisibility: 'NAMES',
      // The two looks are drawn when the card is pressed, from what this
      // account may actually use — see `rollLooks`.
    },
  },
  {
    key: 'NO_SURPRISES',
    setup: {
      ...DEFAULT_SETUP,
      access: 'INVITE',
      anonymity: 'OPEN',
      seats: null,
      costMode: 'NO_BUDGET',
      menuVisibility: 'NAMES',
    },
  },
  {
    key: 'NO_STRESS',
    setup: {
      ...DEFAULT_SETUP,
      access: 'CODE',
      anonymity: 'ANONYMOUS',
      seats: null,
      requiresApproval: false,
      slotMode: 'FREE',
      costMode: 'NONE',
    },
  },
  { key: 'RANDOM' },
  { key: 'MANUAL' },
]

function one<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * A cloth and a word list, drawn from what this account may actually lay.
 *
 * Never from the whole catalogue: half of it is Crème and five of the cloths
 * are back in the workshop (0082), so an honest random has to be handed the
 * shelf as the server answered it. Given nothing, it stays on the house table
 * rather than guessing.
 */
export function rollLooks(
  nameThemes: { code: string; owned: boolean; paused?: boolean }[] | undefined,
  tableThemes: { code: string; owned: boolean; paused?: boolean }[] | undefined,
): Pick<RoundSetup, 'nameTheme' | 'tableTheme'> {
  const names = (nameThemes ?? []).filter((x) => x.owned && !x.paused)
  const tables = (tableThemes ?? []).filter((x) => x.owned && !x.paused)
  return {
    nameTheme: (names.length ? one(names).code : DEFAULT_SETUP.nameTheme) as NameTheme,
    tableTheme: (tables.length ? one(tables).code : DEFAULT_SETUP.tableTheme) as TableTheme,
  }
}

/**
 * EVERYTHING SHUFFLED, AND NOTHING BROKEN.
 *
 * The dice roll only over answers this account can actually give: the looks
 * come from the shelf, the recipe count stays at one without Crème, and the
 * thread is left to the compass rather than picked from a catalogue the roll
 * cannot see — which also makes the random dinner the one where even the host
 * does not know what the table is cooking against (0089).
 */
export function randomSetup(
  isPro: boolean,
  nameThemes: { code: string; owned: boolean; paused?: boolean }[] | undefined,
  tableThemes: { code: string; owned: boolean; paused?: boolean }[] | undefined,
): RoundSetup {
  const costMode = one(['NONE', 'NO_BUDGET'] as const)
  return {
    ...DEFAULT_SETUP,
    ...rollLooks(nameThemes, tableThemes),
    access: one(['CODE', 'INVITE', 'CODE_AND_INVITE'] as const),
    anonymity: one(['ANONYMOUS', 'ANONYMOUS', 'SPY', 'OPEN'] as const),
    requiresApproval: Math.random() < 0.5,
    seats: one([6, 8, 10, null] as const),
    slotMode: one(['FREE', 'CATEGORIES'] as const),
    votingMode: one(['LIVE', 'TIMED', 'MANUAL'] as const),
    recipesPerBrief: isPro ? one([1, 2, 3] as const) : 1,
    filRougeCategory: one([null, 'COUNTRY', 'COLOUR', 'LETTER'] as const),
    // '?' is the sealed draw: the server picks and tells nobody until the
    // dinner is dealt. For the categories that are not the world it is the
    // same mechanism — a value drawn from this week's shelf.
    filRougeCode: '?',
    filRougeScope: 'SHARED',
    costMode,
    budget: '',
    menuVisibility: one(['HIDDEN', 'NAMES'] as const),
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
