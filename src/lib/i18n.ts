import i18n, { type BackendModule } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// EN is the default locale. Every user-facing string lives in these
// resource files, never inline in a component — that includes email
// templates and canned chat bodies, which are localised server-side
// (message_templates.locale) rather than through this client bundle.
//
// Note the split: this fallback only covers UI strings. The
// database-backed ones have their own story — assign_secret_name falls
// back across locales itself, while get_message_templates does not, which
// is why adding a third language needs more than a third JSON file. See
// PRESENTATION.md, "Internationalisation".
export const SUPPORTED_LOCALES = ['en', 'fr', 'it', 'es'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

// One language downloaded, not four. Each file is its own chunk, fetched when
// it is first needed: the detected one at start, another the moment somebody
// switches to it (changeLanguage waits for the file before it switches, so
// nothing on screen flashes in the wrong language). All four used to ride in
// the start-up bundle, about 440 KB of which a visitor reads a quarter.
const LOADERS: Record<SupportedLocale, () => Promise<{ default: object }>> = {
  en: () => import('../locales/en/common.json'),
  fr: () => import('../locales/fr/common.json'),
  it: () => import('../locales/it/common.json'),
  es: () => import('../locales/es/common.json'),
}

const lazyLocales: BackendModule = {
  type: 'backend',
  init() {},
  read(lng, _ns, done) {
    const load = LOADERS[lng as SupportedLocale]
    if (!load) return done(null, {})
    load()
      .then((m) => done(null, m.default as Record<string, unknown>))
      .catch((err: unknown) => done(err as Error, false))
  },
}

/** Resolves once the starting language is loaded; main.tsx renders after it. */
export const i18nReady = i18n
  .use(lazyLocales)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Every language is complete (tests/locales.test.ts holds them to it), so
    // each loads alone. English is only the answer for a browser asking for
    // a language the app does not speak.
    fallbackLng: { en: [], fr: [], it: [], es: [], default: ['en'] },
    supportedLngs: SUPPORTED_LOCALES,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: { escapeValue: false },
  })

export default i18n
