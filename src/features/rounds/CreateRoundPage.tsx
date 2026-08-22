import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  createRound,
  type RoundAccess,
  type RoundAnonymity,
  type SlotMode,
  type VotingMode,
} from '../../lib/rpc'

// Classic is the whole product with nothing to decide: a covered dinner,
// one recipe each, voting on. Custom opens the rest. This is the "default
// to simple" principle from README.md made literal — most hosts should
// never see a radio button.
// Kept in step with rounds_max_players_sane (0020). Three is where a chain
// stops being a swap; thirty is where the secret-name list runs out and
// people start being numbered instead of named.
const MIN_PLAYERS = 3
const MAX_PLAYERS = 30

const CLASSIC = {
  access: 'CODE' as RoundAccess,
  anonymity: 'ANONYMOUS' as RoundAnonymity,
  slotMode: 'FREE' as SlotMode,
  votingMode: 'LIVE' as VotingMode,
  requiresApproval: true,
}

export function CreateRoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [custom, setCustom] = useState(false)
  const [access, setAccess] = useState<RoundAccess>(CLASSIC.access)
  const [anonymity, setAnonymity] = useState<RoundAnonymity>(CLASSIC.anonymity)
  const [requiresApproval, setRequiresApproval] = useState(CLASSIC.requiresApproval)
  const [votingMode, setVotingMode] = useState<VotingMode>(CLASSIC.votingMode)
  const [slotMode, setSlotMode] = useState<SlotMode>(CLASSIC.slotMode)
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
        ...(custom
          ? { access, anonymity, slotMode, votingMode, requiresApproval }
          : CLASSIC),
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
    <div className="stack sheet">
      <h1>{t('rounds.create')}</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div>
          <label htmlFor="name">{t('rounds.name')}</label>
          <input id="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="card stack">
          <label className="row">
            <input
              type="radio"
              style={{ width: 'auto' }}
              checked={!custom}
              onChange={() => setCustom(false)}
            />
            <span>
              <strong>{t('rounds.setup.classic')}</strong>
              <span className="muted"> — {t('rounds.setup.classicHint')}</span>
            </span>
          </label>
          <label className="row">
            <input
              type="radio"
              style={{ width: 'auto' }}
              checked={custom}
              onChange={() => setCustom(true)}
            />
            <span>
              <strong>{t('rounds.setup.custom')}</strong>
              <span className="muted"> — {t('rounds.setup.customHint')}</span>
            </span>
          </label>
        </div>

        {custom && (
          <div className="stack card">
            <div>
              <label htmlFor="access">{t('rounds.access.label')}</label>
              <select id="access" value={access} onChange={(e) => setAccess(e.target.value as RoundAccess)}>
                <option value="CODE">{t('rounds.access.CODE')}</option>
                <option value="INVITE">{t('rounds.access.INVITE')}</option>
              </select>
              <p className="muted">{t(`rounds.access.${access}Hint`)}</p>
            </div>

            <div>
              <label htmlFor="anonymity">{t('rounds.anonymity.label')}</label>
              <select
                id="anonymity"
                value={anonymity}
                onChange={(e) => setAnonymity(e.target.value as RoundAnonymity)}
              >
                <option value="ANONYMOUS">{t('rounds.anonymity.ANONYMOUS')}</option>
                <option value="SPY">{t('rounds.anonymity.SPY')}</option>
                <option value="OPEN">{t('rounds.anonymity.OPEN')}</option>
              </select>
              <p className="muted">{t(`rounds.anonymity.${anonymity}Hint`)}</p>
            </div>

            <div>
              <label htmlFor="votingMode">{t('rounds.voting.label')}</label>
              <select
                id="votingMode"
                value={votingMode}
                onChange={(e) => setVotingMode(e.target.value as VotingMode)}
              >
                <option value="LIVE">{t('rounds.voting.LIVE')}</option>
                <option value="TIMED">{t('rounds.voting.TIMED')}</option>
                <option value="DISABLED">{t('rounds.voting.DISABLED')}</option>
              </select>
              {/* The one setting with no way back: advance_phase refuses to
                  enter VOTING at all on a DISABLED round, on purpose. Saying
                  so here is cheaper than a support question later. */}
              <p className={votingMode === 'DISABLED' ? 'error' : 'muted'}>
                {t(`rounds.voting.${votingMode}Hint`)}
              </p>
            </div>

            <div>
              <label htmlFor="slotMode">{t('rounds.slotMode.label')}</label>
              <select id="slotMode" value={slotMode} onChange={(e) => setSlotMode(e.target.value as SlotMode)}>
                <option value="FREE">{t('rounds.slotMode.FREE')}</option>
                <option value="CATEGORIES">{t('rounds.slotMode.CATEGORIES')}</option>
              </select>
            </div>

            {/* Shown so the shape of the product is legible, disabled because
                neither is built — see PRESENTATION.md, both are v2. */}
            <div>
              <label htmlFor="nameTheme">{t('rounds.nameTheme.label')}</label>
              <select id="nameTheme" disabled value="FOOD">
                <option value="FOOD">{t('rounds.nameTheme.FOOD')}</option>
              </select>
              <p className="muted">{t('rounds.comingSoon')}</p>
            </div>

            <div>
              <label htmlFor="recipesPerBrief">{t('rounds.recipesPerBrief.label')}</label>
              <select id="recipesPerBrief" disabled value="1">
                <option value="1">{t('rounds.recipesPerBrief.one')}</option>
              </select>
              <p className="muted">{t('rounds.comingSoon')}</p>
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
          </div>
        )}

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
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              required
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
            {/* Mirrors the rounds_max_players_sane constraint (0020) so the
                limit is explained here rather than discovered as a raw
                Postgres error after the click. */}
            {maxPlayers > MAX_PLAYERS && <p className="error">{t('rounds.tooManyPlayers')}</p>}
            {maxPlayers < MIN_PLAYERS && <p className="error">{t('rounds.tooFewPlayers')}</p>}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || (limitPlayers && (maxPlayers > MAX_PLAYERS || maxPlayers < MIN_PLAYERS))}
        >
          {t('actions.submit')}
        </button>
      </form>
    </div>
  )
}
