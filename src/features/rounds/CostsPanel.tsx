import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import {
  costsSoFar,
  fromCents,
  getMyBrief,
  recordExpense,
  settleCosts,
  toCents,
  type RoundStatus,
} from '../../lib/rpc'

/**
 * What the evening is costing, and who owes whom at the end.
 *
 * THE SHAPE OF THIS SCREEN IS A DECISION, and it is the only interesting thing
 * about the feature. While the dinner is running it shows **your** number, the
 * table's average and the budget — and never a per-person list.
 *
 * The case for the list is real: seeing that everyone else is at €12 would let
 * somebody about to spend €40 reconsider. The case against is that it is a
 * leaderboard about money between friends. It invites exactly the comparison
 * the feature exists to remove, and the person who has overspent finds out in
 * front of everybody who has not. The average keeps the steering signal and
 * drops the comparison: "everyone is around twelve and I am at thirty-five" is
 * the half that helps; "Marta is at thirty-five" is the half that starts an
 * argument at a table Marta is sitting at.
 *
 * At settlement the individual numbers do appear, and they have to — nobody can
 * be asked for eight euros without being told why. By then the dinner is a
 * memory rather than a competition.
 */
export function CostsPanel({
  roundId,
  status,
  budgetPerHead,
  currency,
}: {
  roundId: string
  status: RoundStatus
  budgetPerHead: number | null
  currency: string
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const locale = profile?.locale ?? i18n.language ?? 'en'

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { data: costs } = useQuery({
    queryKey: ['rounds', roundId, 'costs'],
    enabled: !!roundId,
    queryFn: () => costsSoFar(roundId),
  })

  // The shopping list you were actually given. The whole reason this panel and
  // the ingredients belong on one screen: you tally what you spent against what
  // you were asked to buy, not against a memory of a receipt.
  const { data: myBrief } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief'],
    enabled: !!roundId,
    queryFn: () => getMyBrief(roundId),
    retry: false,
  })

  const settled = status === 'VOTING' || status === 'RESULTS' || status === 'ARCHIVED'
  const { data: settlement } = useQuery({
    queryKey: ['rounds', roundId, 'settlement'],
    enabled: !!roundId && settled,
    queryFn: () => settleCosts(roundId),
    retry: false,
  })

  // The stored number is the truth; the box starts from it so somebody
  // correcting a figure edits it rather than retyping it from nothing.
  useEffect(() => {
    if (costs && amount === '' && costs.my_spend_cents > 0) {
      setAmount((costs.my_spend_cents / 100).toFixed(2))
    }
    // Only ever seeds the field once, on the way in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costs])

  async function save() {
    const cents = toCents(amount)
    if (cents === null) {
      setError(t('costs.amountInvalid'))
      return
    }
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      await recordExpense(roundId, cents, note)
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'costs'] })
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'settlement'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(t(`costs.errors.${raw}`, { defaultValue: raw || t('errors.generic') }))
    } finally {
      setBusy(false)
    }
  }

  const money = (cents: number) => fromCents(cents, locale, costs?.currency ?? currency)
  const over = budgetPerHead !== null && (costs?.my_spend_cents ?? 0) > budgetPerHead

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      {budgetPerHead !== null && (
        <p className="muted">{t('costs.agreed', { amount: money(budgetPerHead) })}</p>
      )}

      {/* What you were asked to buy. Read-only, and only yours. */}
      {myBrief && myBrief.ingredients.length > 0 && (
        <div>
          <label>{t('costs.yourList')}</label>
          <ul className="recipe__ingredients">
            {myBrief.ingredients.map((ing, i) => (
              <li key={i}>{[ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor={`spend-${roundId}`}>{t('costs.whatYouSpent')}</label>
        <input
          id={`spend-${roundId}`}
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={over ? 'is-taken' : undefined}
        />
        <input
          value={note}
          maxLength={140}
          placeholder={t('costs.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" disabled={busy} onClick={save}>
          {t('costs.save')}
        </button>
        {saved && <p className="muted">{t('costs.saved')}</p>}
      </div>

      {/* The table, without the leaderboard. */}
      {costs && (
        <div className="paper stack">
          <div className="costs__row">
            <span>{t('costs.you')}</span>
            <strong className={over ? 'costs__over' : undefined}>{money(costs.my_spend_cents)}</strong>
          </div>
          <div className="costs__row">
            <span>{t('costs.average')}</span>
            <strong>{money(costs.average_cents)}</strong>
          </div>
          <div className="costs__row">
            <span>{t('costs.total')}</span>
            <strong>{money(costs.total_cents)}</strong>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {t('costs.reported', { reported: costs.reported, people: costs.people })}
          </p>
          {over && <p className="muted" style={{ margin: 0 }}>{t('costs.overBudget')}</p>}
        </div>
      )}

      {/* The bill, once the plates are cleared. Individual numbers appear here
          and nowhere earlier: you cannot be asked for eight euros without being
          told why. */}
      {settled && settlement && settlement.length > 0 && (
        <div className="paper stack">
          <strong>{t('costs.settlementTitle')}</strong>
          <ul className="costs__settlement">
            {settlement.map((line) => (
              <li key={line.member_id} className={line.is_me ? 'is-me' : undefined}>
                <span className="costs__who">
                  {line.who}
                  {line.is_me && ` · ${t('costs.you')}`}
                </span>
                <span className="muted">{money(line.spent_cents)}</span>
                <strong className={line.balance_cents >= 0 ? 'costs__owed' : 'costs__owes'}>
                  {line.balance_cents === 0
                    ? t('costs.square')
                    : line.balance_cents > 0
                      ? t('costs.isOwed', { amount: money(line.balance_cents) })
                      : t('costs.owes', { amount: money(-line.balance_cents) })}
                </strong>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ margin: 0 }}>{t('costs.settlementNote')}</p>
        </div>
      )}
    </div>
  )
}
