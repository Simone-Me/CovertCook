import type { RoundStatus } from '../../lib/rpc'

export type Screen =
  | 'create'
  | 'table'
  | 'brief'
  | 'recipe'
  | 'messages'
  | 'ballot'
  | 'results'
  | 'profile'
  | 'end'

/**
 * ONE DINNER, THE SAME FOR EVERYBODY, ONE PRESS AT A TIME.
 *
 * Each step is a sentence from the chef and the one thing on the screen that
 * can be pressed. Nothing else is: a first-time guest who wanders off into a
 * drawer is a guest who has lost the thread of the story. There is no step
 * closed by an OK in the bubble — every step moves on because something on
 * the dinner itself was pressed, which is the whole point of the tour.
 *
 * The dinner has no state of its own beyond the step it is on — every screen
 * is drawn from how far the story has got (`reached`), so "skip this step"
 * lands on exactly the table a press would have made.
 */
export interface Step {
  /** Also the i18n key of what the chef says: `tutorial.say.<id>`. */
  id: string
  screen: Screen
  phase: RoundStatus
  /** The `data-tour` of the only thing that can be pressed. */
  target?: string
}

export const STEPS: Step[] = [
  { id: 'createPick', screen: 'create', phase: 'DRAFT', target: 'classic' },
  { id: 'createGo', screen: 'create', phase: 'DRAFT', target: 'create' },
  { id: 'tablePass', screen: 'table', phase: 'OPEN', target: 'pass' },
  { id: 'tableInvite', screen: 'table', phase: 'OPEN', target: 'invite' },
  { id: 'tableChefs', screen: 'table', phase: 'OPEN', target: 'envChefs' },
  { id: 'tableAccept', screen: 'table', phase: 'OPEN', target: 'accept' },
  { id: 'tableClose', screen: 'table', phase: 'OPEN', target: 'advance' },
  { id: 'tableMenu', screen: 'table', phase: 'LOCKED', target: 'menuCourses' },
  { id: 'tableRoulette', screen: 'table', phase: 'LOCKED', target: 'roulette' },
  { id: 'tableWrite', screen: 'table', phase: 'LOCKED', target: 'advance' },
  { id: 'tableAssigned', screen: 'table', phase: 'ASSIGNED', target: 'envOrder' },
  { id: 'briefWrite', screen: 'brief', phase: 'ASSIGNED', target: 'sendBrief' },
  { id: 'tableMessages', screen: 'table', phase: 'ASSIGNED', target: 'envMessages' },
  { id: 'messagesSend', screen: 'messages', phase: 'ASSIGNED', target: 'sendMessage' },
  { id: 'messagesReply', screen: 'messages', phase: 'ASSIGNED', target: 'back' },
  { id: 'tableDish', screen: 'table', phase: 'ASSIGNED', target: 'envDish' },
  { id: 'recipeRead', screen: 'recipe', phase: 'ASSIGNED', target: 'back' },
  { id: 'tableDinner', screen: 'table', phase: 'ASSIGNED', target: 'advance' },
  { id: 'tableVote', screen: 'table', phase: 'DINNER', target: 'advance' },
  { id: 'tableBallot', screen: 'table', phase: 'VOTING', target: 'envVote' },
  { id: 'ballotSend', screen: 'ballot', phase: 'VOTING', target: 'sendBallot' },
  { id: 'tableResults', screen: 'table', phase: 'VOTING', target: 'advance' },
  { id: 'tableOpenResults', screen: 'table', phase: 'RESULTS', target: 'envResults' },
  { id: 'resultsReveal', screen: 'results', phase: 'RESULTS', target: 'reveal' },
  { id: 'resultsKeep', screen: 'results', phase: 'RESULTS', target: 'keepRecipe' },
  { id: 'resultsPhoto', screen: 'results', phase: 'RESULTS', target: 'addPhoto' },
  { id: 'profileKept', screen: 'profile', phase: 'RESULTS', target: 'finish' },
  { id: 'end', screen: 'end', phase: 'RESULTS' },
]

export function indexOf(id: string): number {
  return STEPS.findIndex((s) => s.id === id)
}
