import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'

interface Planned {
  title: string
  body: string
}

/**
 * "Calculate your consumption" — announced before it is built.
 *
 * Two footprints, because a dinner app has two: what the evenings put on the
 * plate (ingredients, how far they travelled, how many people shared them),
 * and what the app itself costs to run for you (photographs stored, data
 * moved, the electricity behind both). Neither is computed yet; the page says
 * so on its first line rather than showing invented numbers, which would be
 * worse than no page at all.
 */
export function FootprintPage() {
  const { t } = useTranslation()
  const planned = t('footprint.planned', { returnObjects: true }) as Planned[]

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>
        {t('footprint.title')} <span className="wip-chip">{t('footprint.wip')}</span>
      </h1>
      <p>{t('footprint.lead')}</p>

      {planned.map((p) => (
        <section key={p.title} className="card stack">
          <strong>{p.title}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {p.body}
          </p>
        </section>
      ))}

      <p className="muted">{t('footprint.honest')}</p>
    </div>
  )
}
