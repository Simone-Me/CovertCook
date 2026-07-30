import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useMyRounds } from './hooks'

export function MyRoundsPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { data: rounds, isLoading } = useMyRounds(profile?.id)

  return (
    <div className="stack">
      <h1>{t('rounds.myRounds')}</h1>

      <div className="row">
        <Link to="/rounds/new">
          <button type="button">{t('rounds.create')}</button>
        </Link>
        <Link to="/join">
          <button type="button" className="secondary">
            {t('rounds.join')}
          </button>
        </Link>
      </div>

      {isLoading && <p className="muted">…</p>}

      {rounds && rounds.length === 0 && <p className="muted">{t('app.tagline')}</p>}

      <div className="stack">
        {rounds?.map((r) => (
          <Link key={r.id} to={`/rounds/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ borderLeft: `4px solid ${r.accent_color}` }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  {r.accent_emoji} {r.name}
                </strong>
                <span className="row">
                  {!r.approved && <span className="badge">{t('rounds.pendingApproval')}</span>}
                  <span className="badge">{t(`rounds.phase.${r.status}`)}</span>
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
