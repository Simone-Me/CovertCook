import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import fr from '../locales/fr/common.json'
import en from '../locales/en/common.json'

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
export const SUPPORTED_LOCALES = ['en', 'fr'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: fr },
      en: { common: en },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
