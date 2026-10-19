import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'

// The two places a contribution is taken. The app only links to them: no card
// form here, nothing to secure and nothing to keep.
const BUY_ME_A_COFFEE = 'https://buymeacoffee.com/simonemelotti'
const PAYPAL = 'https://www.paypal.com/paypalme/simonemelotti'

/** A tip jar, said simply. It unlocks nothing: everything is already free. */
export function SupportPage() {
  const { t } = useTranslation()

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('support.title')}</h1>
      <p>{t('support.body')}</p>

      <div className="stack">
        <a className="link-button" href={BUY_ME_A_COFFEE} target="_blank" rel="noopener noreferrer">
          ☕ Buy Me a Coffee
        </a>
        <a className="link-button" href={PAYPAL} target="_blank" rel="noopener noreferrer">
          PayPal
        </a>
      </div>

      <p className="muted">{t('support.thanks')}</p>
    </div>
  )
}
