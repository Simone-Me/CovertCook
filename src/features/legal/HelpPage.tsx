import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BackToTable } from '../../components/BackToTable'

interface QA {
  q: string
  a: string[]
}

/**
 * Questions, and the two things that have to be reachable WITHOUT an account.
 *
 * WHY IT IS PUBLIC. Deleting an account is built and has been since 0049, but
 * it lives behind a login — which is correct, because otherwise anybody could
 * delete anybody. Google Play asks for something else as well: a page a person
 * can reach without installing the app and without being able to sign in. Those
 * are two different needs and this page serves the second without weakening the
 * first.
 *
 * SO THERE IS NO DELETE BUTTON HERE, and there must never be one. The page
 * explains the path, links to the sign-in that leads to it, says exactly what
 * deletion does — anonymised in place, thirty days, cancellable, and the
 * dinners stay because they belong to seven other people too — and gives an
 * address for somebody who cannot sign in at all. That last route is the one
 * the store requirement actually names, and it is an inbox rather than code.
 *
 * Outside the authenticated routes on purpose, like /legal/*.
 */
export function HelpPage() {
  const { t } = useTranslation()
  const faq = t('help.faq', { returnObjects: true }) as QA[]

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('help.title')}</h1>
      <p className="muted">{t('help.intro')}</p>

      {faq.map((item) => (
        <section key={item.q} className="legal__section">
          <h2>{item.q}</h2>
          {item.a.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </section>
      ))}

      <section className="legal__section" id="delete">
        <h2>{t('help.delete.title')}</h2>
        {(t('help.delete.body', { returnObjects: true }) as string[]).map((para) => (
          <p key={para}>{para}</p>
        ))}
        {/* A link to the sign-in, never a button that deletes: the one thing
            this page must not be is a way to delete somebody else's account. */}
        <p>
          <Link to="/signin">{t('help.delete.signIn')}</Link>
        </p>
        <p className="muted">
          {t('help.delete.cannotSignIn')}{' '}
          <a href="mailto:contact@opus35.fr">contact@opus35.fr</a>
        </p>
      </section>

      <section className="legal__section">
        <h2>{t('help.contact.title')}</h2>
        <p>
          {t('help.contact.body')} <a href="mailto:contact@opus35.fr">contact@opus35.fr</a>
        </p>
      </section>
    </div>
  )
}
