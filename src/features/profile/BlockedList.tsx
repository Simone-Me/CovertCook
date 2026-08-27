import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { formatMoment } from '../../lib/datetime'
import { listMyBlocks, unblockUser } from '../../lib/rpc'

/**
 * Everybody you have decided not to sit with again.
 *
 * Blocking happens at the table, by seat, so it never requires learning who
 * somebody is. Unblocking happens here, by name — because by the time anybody
 * changes their mind the dinner is long over, the pseudonym meant nothing
 * outside it, and a list of pseudonyms would be a list of nobody.
 *
 * That asymmetry is the whole design: you blocked them, so you are entitled to
 * see who you blocked. They are told nothing, because telling somebody they
 * have been blocked is how a block becomes an argument.
 */
export function BlockedList() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: blocked } = useQuery({
    queryKey: ['my-blocks', profile?.id],
    enabled: !!profile?.id,
    queryFn: listMyBlocks,
  })

  async function unblock(profileId: string) {
    await unblockUser(profileId)
    await queryClient.invalidateQueries({ queryKey: ['my-blocks'] })
  }

  return (
    <div className="stack">
      <p className="muted">{t('moderation.blockHelp')}</p>
      {(blocked?.length ?? 0) === 0 ? (
        <p className="muted">{t('moderation.noBlocks')}</p>
      ) : (
        blocked?.map((person) => (
          <div key={person.profile_id} className="card row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{person.display_name}</strong>
              <div className="muted">{formatMoment(person.created_at, i18n.language)}</div>
            </div>
            <button type="button" className="secondary" onClick={() => unblock(person.profile_id)}>
              {t('moderation.unblock')}
            </button>
          </div>
        ))
      )}
    </div>
  )
}
