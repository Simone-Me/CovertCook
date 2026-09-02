import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { acknowledgeWarning, myWarnings } from '../../lib/rpc'

/**
 * What the Executive Chef said to you, and nobody else.
 *
 * The middle action of moderation had nowhere to land: between reading a
 * reported message and removing somebody from a dinner there was nothing at
 * all, so a host with a rude phrase in front of them had a choice between
 * shrugging and ending an evening.
 *
 * It appears on the round page rather than arriving as a push, because a
 * warning has to be *read* rather than glimpsed, and it stays until the person
 * says they have read it. Dismissing it is a deliberate press: a notice that
 * scrolls away on its own is a notice that never happened.
 *
 * Nothing here names the host and nothing names the reporter. The warning is
 * about a phrase, and it says which one only if the host chose to write it
 * down.
 */
export function MyWarnings({ roundId }: { roundId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: warnings } = useQuery({
    queryKey: ['rounds', roundId, 'my-warnings'],
    enabled: !!roundId,
    queryFn: () => myWarnings(roundId),
  })

  if (!warnings || warnings.length === 0) return null

  async function dismiss(id: string) {
    await acknowledgeWarning(id)
    await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'my-warnings'] })
  }

  return (
    <>
      {warnings.map((warning) => (
        <div key={warning.id} className="paper stack card--danger">
          <strong>{t('moderation.youWereWarned')}</strong>
          {/* A warning raised from the bell carries no words of the host's own:
              it is one press on a reported phrase, and what it means is the
              same every time. Saying "they did not say more than that" of it
              was true and useless — the person needs to know what the rule is
              and what happens if it goes again, which is exactly what the host
              pressed the button to tell them. */}
          <p style={{ margin: 0 }}>{warning.reason ?? t('moderation.warningGuidelines')}</p>
          <button type="button" className="secondary" onClick={() => dismiss(warning.id)}>
            {t('moderation.warningRead')}
          </button>
        </div>
      ))}
    </>
  )
}
