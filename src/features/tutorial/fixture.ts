import type { Course } from '../../lib/rpc'

/**
 * The guided dinner's table: you and three friends, a Mexican evening, and the
 * chain the roulette always draws. Every word anybody says or writes lives in
 * the locale files (`tutorial.*`); what stays here is who is who.
 *
 * The recipe you write wins. It is the one outcome that shows the whole game
 * in a single line of the results: you chose what Marco cooked, he did not
 * know it was you, and the table liked it best.
 */

export const CHEFS = [
  { key: 'you', name: '', secret: 'Tortilla' },
  { key: 'giulia', name: 'Giulia', secret: 'Avocado' },
  { key: 'marco', name: 'Marco', secret: 'Jalapeño' },
  { key: 'ines', name: 'Inès', secret: 'Lime' },
] as const

export type ChefKey = (typeof CHEFS)[number]['key']

/** Sender writes, cook cooks — in cycle order, so it closes on itself. */
export const CHAIN: { sender: ChefKey; cook: ChefKey; dish: string; course: Course }[] = [
  { sender: 'you', cook: 'marco', dish: 'tacos', course: 'MAIN' },
  { sender: 'marco', cook: 'ines', dish: 'guacamole', course: 'STARTER' },
  { sender: 'ines', cook: 'giulia', dish: 'sopa', course: 'FIRST' },
  { sender: 'giulia', cook: 'you', dish: 'churros', course: 'DESSERT' },
]

/** The menu the host composes at Attribution, in the order a meal is eaten. */
export const COURSES: Course[] = ['STARTER', 'FIRST', 'MAIN', 'DESSERT']

/** Points on the results card, the winner first. */
export const POINTS: Record<string, number> = { tacos: 9, churros: 7, guacamole: 5, sopa: 3 }

export const WINNER = 'tacos'

/** The replies offered in the conversation with your cook. */
export const MESSAGE_CHOICES = ['sure', 'mango', 'hunt'] as const

export function chef(key: ChefKey) {
  return CHEFS.find((c) => c.key === key)!
}
