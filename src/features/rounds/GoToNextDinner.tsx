import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useMyRounds } from './hooks'

// What the home-screen shortcuts open (manifest `shortcuts`). A manifest
// shortcut is a fixed URL, so it cannot name a dinner: this route picks one at
// the moment it is tapped — the first that is still to come, soonest first,
// and only a dinner in which there is something to cook or to say.
const TARGETS: Record<string, string> = { recipe: 'recipe', messages: 'messages' }
const NOT_YET_OR_OVER = ['DRAFT', 'OPEN', 'LOCKED', 'RESULTS', 'ARCHIVED', 'CANCELLED']

export function GoToNextDinner() {
  const { target } = useParams()
  const { profile } = useAuth()
  const { data: rounds, isLoading } = useMyRounds(profile?.id)

  if (isLoading || !rounds) return <p className="muted">…</p>

  const now = Date.now()
  const live = rounds.filter(
    (r) => r.member_status === 'ACTIVE' && r.approved && !NOT_YET_OR_OVER.includes(r.status),
  )
  // Upcoming first, nearest first; dinners already under way after them, most
  // recent first; undated ones last.
  const rank = (r: (typeof live)[number]) => {
    if (!r.dinner_at) return Number.MAX_SAFE_INTEGER
    const at = new Date(r.dinner_at).getTime()
    return at >= now ? at - now : Number.MAX_SAFE_INTEGER / 2 + (now - at)
  }
  const next = [...live].sort((a, b) => rank(a) - rank(b))[0]

  if (!next) return <Navigate to="/" replace />
  const page = target ? TARGETS[target] : undefined
  return <Navigate to={`/rounds/${next.id}${page ? `/${page}` : ''}`} replace />
}
