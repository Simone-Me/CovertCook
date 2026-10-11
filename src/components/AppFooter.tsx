import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

const YEAR = new Date().getFullYear()

/**
 * The hem of the tablecloth.
 *
 * Two things belong here and nothing else. The first is the ordinary set a
 * shipped app owes its users — who made it, terms, privacy, a way to get in
 * touch. Those pages do not exist yet, and rather than link to nothing the
 * ones that are missing say so: a dead link is worse than an honest gap, and
 * the moment money changes hands (ROADMAP §2) they stop being optional.
 *
 * The second is attribution. The favicon is Flaticon's, and their licence asks
 * for credit wherever it appears. That is not a formality to bury — it is the
 * condition under which the app is allowed to use them at all, so it is stated
 * in plain words on every screen rather than hidden behind an About page
 * nobody opens.
 */
export function AppFooter() {
  const { t } = useTranslation()

  return (
    <footer className="app-foot">
      <p className="app-foot__row">
        {/* The build, next to the name. Somebody reporting "it still does the
            thing" needs a way to say which build they are looking at, and
            asking them to open a console is asking them not to report it. */}
        <span>
          © {YEAR} CovertCook <span className="app-foot__version">{__APP_VERSION__}</span>
        </span>
        <Link to="/help">{t('legal.help')}</Link>
        <Link to="/legal/terms">{t('legal.terms')}</Link>
        <Link to="/legal/privacy">{t('legal.privacy')}</Link>
        <Link to="/legal/moderation">{t('legal.moderation')}</Link>
        <a href="mailto:contact@covertcook.fr">{t('legal.contact')}</a>
      </p>

      {/* Who made it look like this — the app's logo included. The favicon is
          a free Flaticon icon, and their licence is the condition for using
          it: the credit stays on every screen (assets-src/README.md). */}
      <p className="app-foot__credit">
        {t('legal.designBy')} Simone Melotti, Javier Diez Cerro · {t('legal.faviconBy')}{' '}
        <a href="https://www.flaticon.com/" target="_blank" rel="noopener noreferrer">
          Flaticon
        </a>
      </p>
    </footer>
  )
}
