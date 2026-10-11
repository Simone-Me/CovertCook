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
 * Written from what the app actually does. Not legal advice: if CovertCook
 * ever sells something again, a lawyer reads these first — the dietary panel
 * holds health data (GDPR Article 9), and a sale brings EU VAT and a statutory
 * right of withdrawal with it.
 */
export function LegalPage({ page }: { page: 'terms' | 'privacy' | 'moderation' }) {
  const { t } = useTranslation()
  const sections = t(`legal.${page}Doc.sections`, { returnObjects: true }) as Section[]

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t(`legal.${page}Doc.title`)}</h1>

      <p className="muted legal__meta">
        {t('legal.updated')}: {t(`legal.${page}Doc.updated`)} · CovertCook · contact@covertcook.fr
      </p>

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
