import type { ChainLink } from './rpc'

// Walks the sender->cook edges into cycle order (get_chain returns rows
// ordered by lap + sender secret name, not by chain position) so the grid
// can render "who's cooking for whom, in order" instead of an alphabetical
// jumble the host would have to trace by hand.
//
// generate_assignment always produces a single cycle, but set_pairing's
// swap is a generic 2-opt edge exchange, which — like any 2-opt move on a
// single cycle — splits it into two disjoint cycles unless the host swaps
// again across the resulting pair to re-merge them. So this must return
// *every* cycle, not just the one reachable from links[0], or a manual
// edit could silently drop members from the view entirely.
export function walkCycles(links: ChainLink[]): ChainLink[][] {
  const bySender = new Map(links.map((l) => [l.sender_member_id, l]))
  const visited = new Set<string>()
  const cycles: ChainLink[][] = []

  for (const start of links) {
    if (visited.has(start.sender_member_id)) continue
    const cycle: ChainLink[] = []
    let current = start
    while (!visited.has(current.sender_member_id)) {
      visited.add(current.sender_member_id)
      cycle.push(current)
      const next = bySender.get(current.cook_member_id)
      if (!next) break
      current = next
    }
    cycles.push(cycle)
  }
  return cycles
}
