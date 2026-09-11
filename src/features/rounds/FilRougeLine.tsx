import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useFilRougeLabel } from '../../lib/filRouge'
import { getFilRouge } from '../../lib/rpc'

/**
 * The dinner's thread, said in one line, wherever it has to be read.
 *
 * FOUR SCREENS, THREE DIFFERENT SENTENCES. The writer needs the thread their
 * COOK has to honour, because they are the one writing to it. The cook needs
 * their own. Everybody else — the table, the menu — needs the dinner's. One
 * server call answers all three (get_fil_rouge, 0085) and `as` says which of
 * the three this instance is asking for, so no screen has to work out the
 * question for itself.
 *
 * Renders nothing at all when the dinner has no fil rouge, which is most
 * dinners: a classic table is never told about a feature it did not choose.
 */
export function FilRougeLine({
  roundId,
  as = 'table',
  className = 'muted',
}: {
  /** Undefined while the route parameter is still being read, which is how
   *  every page here types it. Renders nothing until it arrives. */
  roundId: string | undefined
  /** 'table' the dinner's own · 'cook' the one I must cook · 'sender' the one
   *  the person I am writing for must cook. */
  as?: 'table' | 'cook' | 'sender'
  className?: string
}) {
  const { t } = useTranslation()
  const label = useFilRougeLabel()

  const { data } = useQuery({
    queryKey: ['rounds', roundId, 'fil-rouge'],
    enabled: !!roundId,
    queryFn: () => getFilRouge(roundId as string),
    staleTime: 60 * 1000,
  })

  if (!data?.category) return null

  // SEALED, AND SAID SO RATHER THAN HIDDEN (0089). The compass drew this
  // dinner a country and the server is withholding it from everybody until the
  // roulette has run — so the line that would name it says what is happening
  // instead. Printing nothing would read as a dinner with no thread at all,
  // which is the one thing it is not.
  if (data.sealed) {
    return <p className={className}>{t('filRouge.sealedLine')}</p>
  }

  // On a shared dinner every reader gets the same answer, so the three roles
  // collapse into one. They only diverge once the roulette has dealt one each.
  const code =
    data.scope === 'SHARED'
      ? data.code
      : as === 'cook'
        ? data.my_code
        : as === 'sender'
          ? data.my_cook_code
          : null

  // Per-cook, seen from the table: there is no single value to name, so it
  // names the category instead. Saying nothing would hide the fact that the
  // dinner has a thread at all.
  if (!code) {
    if (data.scope !== 'PER_COOK') return null
    return (
      <p className={className}>
        {t('filRouge.onTheMenu', { value: t(`filRouge.category.${data.category}`) })}
        {' · '}
        {t('filRouge.scope.PER_COOK')}
      </p>
    )
  }

  const value = label(data.category, code)
  const key = as === 'cook' ? 'filRouge.mine' : as === 'sender' ? 'filRouge.forMyCook' : 'filRouge.onTheMenu'
  return <p className={className}>{t(key, { value })}</p>
}
