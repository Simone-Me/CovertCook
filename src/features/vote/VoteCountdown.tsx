import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * How long the vote has left, shown to everyone.
 *
 * The Executive Chef could set a deadline and nothing anywhere said so — not
 * even to them. A deadline only one person knows about is not a deadline, it
 * is a surprise: people were being timed out of a vote they had no reason to
 * think was closing.
 *
 * Ticks once a second, which is affordable because it renders one line and
 * only while a vote is actually open.
 */
export function VoteCountdown({ closesAt }: { closesAt: string }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const left = new Date(closesAt).getTime() - now

  // Past the deadline the round has not necessarily flipped yet — the phase
  // moves on the next cron tick or the next host action — so say "closing"
  // rather than a negative number or a cheerful zero.
  if (left <= 0) return <p className="countdown is-out">{t('vote.closing')}</p>

  const total = Math.floor(left / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <p className={`countdown${left < 60_000 ? ' is-soon' : ''}`}>
      {t('vote.timeLeft')} <span className="countdown__clock">{h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}</span>
    </p>
  )
}
