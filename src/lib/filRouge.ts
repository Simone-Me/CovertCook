import { useTranslation } from 'react-i18next'
import type { FilRougeCategory } from './rpc'

/**
 * The name of a country, in the reader's language, from its ISO code.
 *
 * WHY THERE IS NO TRANSLATION FILE FOR THIS. 194 countries in two languages is
 * 388 strings to write, spell and keep in step, and a hand-written French list
 * gets the accents wrong. The browser already knows every one of them, in
 * every locale, and knows them better than we would — so the catalogue stores
 * 'JP' rather than 'JAPAN' (0084), the app carries no country strings at all,
 * and a third language costs nothing.
 *
 * The fallback is the code itself, which is at least recognisable, for the rare
 * engine without Intl.DisplayNames — and for the empty locale, which throws.
 */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * The label for any fil rouge value: a country from the browser, a letter from
 * itself, everything else from the translations.
 */
export function useFilRougeLabel() {
  const { t, i18n } = useTranslation()
  return (category: FilRougeCategory, code: string) => {
    if (category === 'COUNTRY') return countryName(code, i18n.language)
    if (category === 'LETTER') return code
    return t(`filRouge.value.${code}`, { defaultValue: code })
  }
}
