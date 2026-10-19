import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'

// The two places a contribution is taken. The app only links to them: no card
// form here, nothing to secure and nothing to keep.
const BUY_ME_A_COFFEE = 'https://www.buymeacoffee.com/simonemelotti'
const PAYPAL = 'https://www.paypal.com/paypalme/simonemelotti'

/** A tip jar, said simply. It unlocks nothing: everything is already free. */
export function SupportPage() {
  const { t } = useTranslation()

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('support.title')}</h1>
      <p>{t('support.body')}</p>

      <div className="support__buttons">
        {/* Buy Me a Coffee's own button, saved into public/ rather than
            hot-linked from img.buymeacoffee.com: the CSP allows images from
            this site only, and a visitor's browser has no reason to call a
            third party just because they opened this page. */}
        <a className="support__bmc" href={BUY_ME_A_COFFEE} target="_blank" rel="noopener noreferrer">
          <img src="/support/buy-me-a-pizza.svg" alt="Buy me a pizza" width={226} height={50} />
        </a>
        {/* Drawn to PayPal's button guide (developer.paypal.com/log-in/
            designer-guide): a pill in PayPal's accessible blue, white
            sans-serif text, and PayPal's own mark in white — the guide's
            rule for a coloured button. Same height as the pizza beside it. */}
        <a
          className="support__paypal"
          href={PAYPAL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`PayPal — ${t('support.paypal')}`}
        >
          <img src="/support/paypal-mark-white.svg" alt="" width={24} height={24} />
          <span>{t('support.paypal')}</span>
        </a>
      </div>

      <p className="muted">{t('support.thanks')}</p>
    </div>
  )
}
