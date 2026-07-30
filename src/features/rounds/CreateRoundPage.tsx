import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createRound, type RoundAnonymity, type RoundVisibility } from '../../lib/rpc'

export function CreateRoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<RoundVisibility>('PRIVATE_CODE')
  const [anonymity, setAnonymity] = useState<RoundAnonymity>('ANONYMOUS')
  const [requiresApproval, setRequiresApproval] = useState(true)
  const [limitPlayers, setLimitPlayers] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const roundId = await createRound({
        name,
        visibility,
        anonymity,
        requiresApproval,
        maxPlayers: limitPlayers ? maxPlayers : null,
      })
      navigate(`/rounds/${roundId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stack">
      <h1>{t('rounds.create')}</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div>
          <label htmlFor="name">{t('rounds.name')}</label>
          <input id="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label htmlFor="visibility">{t('rounds.visibility.label')}</label>
          <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as RoundVisibility)}>
            <option value="PRIVATE_CODE">{t('rounds.visibility.PRIVATE_CODE')}</option>
            <option value="PUBLIC_LINK">{t('rounds.visibility.PUBLIC_LINK')}</option>
          </select>
        </div>

        <div>
          <label htmlFor="anonymity">{t('rounds.anonymity.label')}</label>
          <select id="anonymity" value={anonymity} onChange={(e) => setAnonymity(e.target.value as RoundAnonymity)}>
            <option value="ANONYMOUS">{t('rounds.anonymity.ANONYMOUS')}</option>
            <option value="OPEN">{t('rounds.anonymity.OPEN')}</option>
          </select>
        </div>

        <label className="row">
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
          />
          {t('rounds.requiresApproval')}
        </label>

        <label className="row">
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={limitPlayers}
            onChange={(e) => setLimitPlayers(e.target.checked)}
          />
          {t('rounds.limitPlayers')}
        </label>

        {limitPlayers && (
          <div>
            <label htmlFor="maxPlayers">{t('rounds.maxPlayers')}</label>
            <input
              id="maxPlayers"
              type="number"
              min={3}
              required
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
          </div>
        )}

        <button type="submit" disabled={submitting}>
          {t('actions.submit')}
        </button>
      </form>
    </div>
  )
}
