import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TurnBack } from './TurnBack'

/**
 * The languages this app is actually written in.
 *
 * `label` is the name of the language IN that language, which is the only form
 * that helps the person who needs the control: somebody who cannot read the
 * current language cannot read "French" either, and can read "Français".
 * `search` carries the other spellings so the box finds it however it is
 * typed — a third language costs one row here and nothing else.
 */
const LANGS = [
  { code: 'fr', label: 'Français', search: 'francais french français fr' },
  { code: 'en', label: 'English', search: 'english anglais en' },
] as const

type LangCode = (typeof LANGS)[number]['code']

/**
 * Changing the language, and the one gesture this app uses for changing
 * anything already decided.
 *
 * THE CONTROL USED TO BE BOTH ANSWERS, SIDE BY SIDE, one of them highlighted.
 * That reads as a setting with two positions rather than as a decision already
 * taken, and it does not survive a third language: three buttons is a row, and
 * eight is a paragraph of chrome on the sign-in page.
 *
 * So it is the shape the rest of the app uses for exactly this — the current
 * answer, and the turning arrow ↺ beside it. The arrow only offers: it opens a
 * search and a list, and nothing changes until the language is picked and the
 * change confirmed. Two gestures for a control that can make every word on the
 * screen unreadable to the person pressing it is the right number.
 *
 * It changes i18next only. Once an account exists the profile writes the
 * choice to the row and that becomes the source of truth; until then there is
 * no row to write to, and i18next's own detector remembers it locally — which
 * is what `onChange` is for: the profile passes the writer, and the same
 * control then does both jobs.
 */
export function LanguageSwitch({ onChange }: { onChange?: (code: LangCode) => void } = {}) {
  const { t, i18n } = useTranslation()
  const current: LangCode = i18n.language.startsWith('en') ? 'en' : 'fr'

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // What is about to be chosen, which is not yet what is chosen: the confirm
  // below is the act. Null means the list is open and nothing is aimed at.
  const [aimed, setAimed] = useState<LangCode | null>(null)

  const currentLabel = LANGS.find((l) => l.code === current)?.label ?? current
  const q = query.trim().toLowerCase()
  const found = q ? LANGS.filter((l) => l.search.includes(q)) : LANGS

  function apply() {
    if (!aimed) return
    if (onChange) onChange(aimed)
    else i18n.changeLanguage(aimed)
    setOpen(false)
    setAimed(null)
    setQuery('')
  }

  return (
    <div className="langswitch">
      <div className="langswitch__head">
        <span className="langswitch__label">{t('app.language')}</span>
        {/* The answer in force, as a button rather than as a line of text:
            pressing it opens the same list the arrow does, because somebody
            who wants to change their language aims at the language. */}
        <button
          type="button"
          className="langswitch__opt is-on"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {currentLabel}
        </button>
        <TurnBack open={open} label={t('app.languageChange')} onToggle={() => setOpen((v) => !v)} />
      </div>

      {open && (
        <div className="langswitch__body">
          <input
            type="search"
            value={query}
            placeholder={t('app.languageSearch')}
            aria-label={t('app.languageSearch')}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="langswitch__list">
            {found.map((lang) => (
              <button
                key={lang.code}
                type="button"
                className={`langswitch__opt${aimed === lang.code ? ' is-aimed' : ''}${
                  current === lang.code ? ' is-on' : ''
                }`}
                aria-pressed={aimed === lang.code}
                onClick={() => setAimed(lang.code)}
              >
                {lang.label}
              </button>
            ))}
            {found.length === 0 && <p className="muted">{t('app.languageNone')}</p>}
          </div>

          {/* Nothing has changed yet, and the button says which language it
              would change to — "confirm" alone would be asking somebody to
              confirm a thing they can no longer see. */}
          <div className="row">
            <button
              type="button"
              disabled={!aimed || aimed === current}
              onClick={apply}
            >
              {t('app.languageConfirm', {
                lang: LANGS.find((l) => l.code === aimed)?.label ?? '',
              })}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setOpen(false)
                setAimed(null)
                setQuery('')
              }}
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
