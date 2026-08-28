import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'

interface Section {
  heading: string
  body: string[]
}

/**
 * Terms and Privacy, rendered from the locale files so both languages stay in
 * step — a policy that says different things in French and English is worse
 * than one that only exists in one.
 *
 * These are drafts written from what the app actually does, not legal advice.
 * They need a lawyer before CovertCook takes a single euro, and two things in
 * particular need one: the dietary panel collects health data (GDPR Article 9
 * special category), and the paid tier brings EU VAT on digital goods and a
 * statutory right of withdrawal with it. Both are flagged in the text rather
 * than quietly assumed away.
 */
export function LegalPage({ page }: { page: 'terms' | 'privacy' | 'moderation' }) {
  const { t } = useTranslation()
  const sections = t(`legal.${page}Doc.sections`, { returnObjects: true }) as Section[]

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t(`legal.${page}Doc.title`)}</h1>

      <p className="muted legal__meta">
        {t('legal.updated')}: {t(`legal.${page}Doc.updated`)} · Opus35 · contact@opus35.fr
      </p>

      <div className="legal__draft">{t('legal.draftNote')}</div>

      {sections.map((section) => (
        <section key={section.heading} className="legal__section">
          <h2>{section.heading}</h2>
          {section.body.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </section>
      ))}
    </div>
  )
}
