import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'

// Where a contribution is taken: a Ko-fi, Buy Me a Coffee, PayPal.me or Stripe
// Payment Link page. Set in Netlify as VITE_DONATION_URL. The app never
// handles the payment itself — it only sends people to that page — so there is
// no card form here, nothing to secure and nothing to keep.
const DONATION_URL = import.meta.env.VITE_DONATION_URL ?? ''

/**
 * "Buy me a coffee", in place of Crème while nothing is sold.
 *
 * A gift and nothing else: it unlocks nothing, because everything is already
 * open to everybody (0104). Saying so plainly is the point — a tip jar that
 * hints at perks is a paywall with better manners.
 */
export function SupportPage() {
  const { t } = useTranslation()
  const paras = t('support.body', { returnObjects: true }) as string[]

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('support.title')}</h1>
      {paras.map((p) => (
        <p key={p}>{p}</p>
      ))}

      {DONATION_URL ? (
        <a className="link-button" href={DONATION_URL} target="_blank" rel="noopener noreferrer">
          ☕ {t('support.cta')}
        </a>
      ) : (
        <p className="muted">{t('support.soon')}</p>
      )}

      <p className="muted">{t('support.nothingChanges')}</p>
    </div>
  )
}
