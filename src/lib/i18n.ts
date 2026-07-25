import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import fr from '../locales/fr/common.json'
import en from '../locales/en/common.json'

// FR is the default locale (§13). Every user-facing string lives in these
// resource files, never inline in a component — that includes email
// templates and canned chat bodies, which are localised server-side
// (message_templates.locale) rather than through this client bundle.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: fr },
      en: { common: en },
    },
    fallbackLng: 'fr',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
