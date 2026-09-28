import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * How long until the dinner itself, while the recipes are being written.
 *
 * One quiet line under the dinner's name: it is there so a cook who opens the
 * table knows how many evenings they have left to shop and practise, not to
 * hurry anybody. Nothing at all when no date is set, and nothing once the
 * moment has passed — the host moves the dinner on, not a clock.
 */
export function DinnerCountdown({ at }: { at: string }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const left = new Date(at).getTime() - now
  if (!(left > 0)) return null

  const minutes = Math.floor(left / 60_000)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  const when = d > 0 ? t('rounds.countdown.days', { d, h }) : t('rounds.countdown.hours', { h, m })

  return <p className="muted dinnercountdown">⏳ {t('rounds.countdown.line', { when })}</p>
}
