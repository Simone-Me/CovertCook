import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'
import { CreateWithChef } from './CreateWithChef'

/**
 * CHOOSING A DINNER BEFORE CONFIGURING ONE.
 *
 * The screen used to be a name, a radio with two positions, and — behind the
 * second position — every decision the app can take. Then a grid of cards,
 * each naming a mood and leaving the host to guess what it set. Now the chef
 * asks, one line at a time, and the page underneath is only the table he is
 * leaning on (see `CreateWithChef`). The long form is still one answer away,
 * for the host who has a fifteen-question answer.
 */
export function CreateRoundPage() {
  const { t } = useTranslation()
  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('rounds.create')}</h1>
      <p className="muted">{t('rounds.chef.lead')}</p>
      <CreateWithChef />
    </div>
  )
}
