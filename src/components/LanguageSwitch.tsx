import { useTranslation } from 'react-i18next'

const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
] as const

/**
 * Changing the language before there is an account to store it on.
 *
 * The only switch used to live in the profile, which is behind the sign-in
 * form — so somebody who could not read the sign-in form had to read it to get
 * to the control that would translate it. This sits on the auth pages
 * themselves, where the problem actually is.
 *
 * It changes i18next only. Once an account exists the profile writes the
 * choice to the row and that becomes the source of truth; until then there is
 * no row to write to, and i18next's own detector remembers it locally.
 */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const current = i18n.language.startsWith('en') ? 'en' : 'fr'

  return (
    <div className="langswitch">
      <span className="langswitch__label">{t('app.language')}</span>
      {LANGS.map((lang) => (
        <button
          key={lang.code}
          type="button"
          className={`langswitch__opt${current === lang.code ? ' is-on' : ''}`}
          aria-pressed={current === lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
