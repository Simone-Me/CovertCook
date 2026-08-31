import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import {
  listNameThemes,
  listTableThemes,
  myProStatus,
  proWarningLevel,
  roundProCover,
  PRO_GRACE_HOURS,
  type NameTheme,
  type TableTheme,
} from '../../lib/rpc'

/**
 * "Your PRO is ending", said twice and then not again.
 *
 * A MONTH OUT AND A WEEK OUT, and nothing in between. The temptation with a
 * subscription that lapses is to warn continuously, which produces a banner
 * people stop seeing weeks before it starts mattering. Two moments, each with
 * a reason to exist: a month is enough time to decide without hurrying, a week
 * is enough to act on a decision already made.
 *
 * Silent during the free-for-all: everybody has PRO and nobody's is ending, so
 * there is nothing true to say.
 */
export function ProEndingNotice() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const locale = profile?.locale ?? i18n.language ?? 'en'
  const { data: status } = useQuery({
    queryKey: ['pro', 'status'],
    queryFn: myProStatus,
    staleTime: 60 * 1000,
  })

  const level = proWarningLevel(status)
  if (!level || !status?.expires_at) return null

  return (
    <div className={`notice pro-notice pro-notice--${level.toLowerCase()}`}>
      <strong>
        {t(`pro.ending.${level}`, {
          date: new Date(status.expires_at).toLocaleDateString(locale, {
            day: 'numeric',
            month: 'long',
          }),
        })}
      </strong>
      <p style={{ margin: '4px 0 0' }}>
        {t('pro.ending.whatHappens', { hours: PRO_GRACE_HOURS })}
      </p>
      <p style={{ margin: '6px 0 0' }}>
        <Link to="/pro">{t('pro.ending.renew')}</Link>
      </p>
    </div>
  )
}

/**
 * The same fact, told about one dinner, on the dinner.
 *
 * This is the one that matters: a host reading "your subscription ends on the
 * 14th" in their profile has not necessarily worked out that the dinner they
 * are planning for the 16th is the thing at stake. Said on the dinner, with
 * its own date, it is a sentence about an evening rather than about a bill.
 */
export function RoundProNotice({
  round,
  isHost,
}: {
  round: {
    is_pro: boolean
    pro_until: string | null
    recipes_per_brief: number
    name_theme: NameTheme
    table_theme: TableTheme
  }
  isHost: boolean
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const locale = profile?.locale ?? i18n.language ?? 'en'

  // Only to know which themes are the paid ones, so the client's answer
  // matches round_uses_pro(). Static, cached, and shared with the pickers.
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

  const cover = roundProCover({
    ...round,
    paidNameThemes: (nameThemes ?? []).filter((x) => x.tier === 'PAID').map((x) => x.code),
    paidTableThemes: (tableThemes ?? []).filter((x) => x.tier === 'PAID').map((x) => x.code),
  })

  if (cover === 'NONE' || cover === 'OK' || !round.pro_until) return null

  const date = new Date(round.pro_until).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  })

  // Everybody at the table is told, not only the host — they are the ones who
  // would otherwise find the dinner stopped with no explanation — but only the
  // host is told to do something about it, because only the host can.
  return (
    <div className={cover === 'HELD' ? 'error pro-notice' : 'notice pro-notice pro-notice--week'}>
      <strong>{t(cover === 'HELD' ? 'pro.round.held' : 'pro.round.ending', { date })}</strong>
      <p style={{ margin: '4px 0 0' }}>
        {t(cover === 'HELD' ? 'pro.round.heldWhat' : 'pro.round.endingWhat', {
          hours: PRO_GRACE_HOURS,
        })}
      </p>
      {isHost && (
        <p style={{ margin: '6px 0 0' }}>
          <Link to="/pro">{t('pro.ending.renew')}</Link>
        </p>
      )}
    </div>
  )
}
