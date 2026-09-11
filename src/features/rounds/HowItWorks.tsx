import { useTranslation } from 'react-i18next'
import { Fold } from '../../components/Fold'

/**
 * What this app is, for somebody who has just arrived — and for anybody who
 * wants to read it again later.
 *
 * It was the first-run panel and nothing else, which meant it vanished the
 * moment somebody joined their first dinner: the explanation disappeared
 * exactly when they had finally seen enough of the app to have questions about
 * it. The same component is folded away at the foot of the list instead.
 *
 * ONE QUESTION, ONE FOLD. Both headings here are literally questions, and the
 * answers were printed under them at full length — so the panel opened as a
 * page of prose that nobody reads standing in a kitchen. Folded, it reads as
 * what it is: a short list of things you might be wondering, and you open the
 * one you are wondering about. The first one is open on the first run, because
 * somebody who has just made an account is wondering exactly that.
 *
 * The "why this exists" section is written in the first person on purpose. The
 * rest of the app speaks as the app; this one paragraph is the person who made
 * it, and a register shift is what tells a reader which is which.
 */
export function HowItWorks({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="stack">
      {!compact && (
        <>
          <h2>{t('welcome.title')}</h2>
          <p>{t('welcome.lead')}</p>
        </>
      )}

      <Fold title={t('welcome.howTitle')} defaultOpen={!compact}>
        <ol className="howto__steps">
          {(t('welcome.how', { returnObjects: true }) as string[]).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Fold>

      <Fold title={t('welcome.whyTitle')}>
        {(t('welcome.why', { returnObjects: true }) as string[]).map((para) => (
          <p key={para} className="welcome__why">
            {para}
          </p>
        ))}
      </Fold>

      {!compact && (
        <p className="muted small-italic">
          {t('welcome.start')} {t('welcome.next')}
        </p>
      )}
    </div>
  )
}
