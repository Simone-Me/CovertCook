import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { Fold } from '../../components/Fold'
import { formatMoment } from '../../lib/datetime'
import { forgetPhoto, myAlbum, photoUrl, type AlbumEntry } from '../../lib/rpc'

/**
 * The evenings you chose to keep.
 *
 * A LIST FIRST, PICTURES SECOND. An album of full-width photographs is a
 * beautiful thing to scroll and a useless thing to look something up in: by the
 * fourth dinner you are pushing past pictures to find a night you can already
 * name. So the page is the index — one line per evening, its name and its date
 * — and the triangle opens the one you came for. The same disclosure the
 * settings use, for the same reason: read them one at a time.
 *
 * NOTHING IS HERE BY ACCIDENT. Being at a dinner does not put its photograph in
 * your album; pressing add on the results screen does (0068), exactly as it
 * does for a recipe (0058). That is what makes this worth opening — everything
 * in it was chosen — and it is also what makes it survive: each row is a copy,
 * so the dinner being purged three weeks later (0062) takes nothing from here.
 */
export function Album() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()

  const { data: evenings } = useQuery({
    queryKey: ['my-album', profile?.id],
    enabled: !!profile?.id,
    queryFn: myAlbum,
  })

  if (!evenings || evenings.length === 0) {
    return <p className="muted">{t('album.profileEmpty')}</p>
  }

  return (
    <div className="stack">
      {evenings.map((evening) => (
        <Fold
          key={evening.id}
          title={evening.round_name}
          aside={evening.dinner_at ? formatMoment(evening.dinner_at, i18n.language) : undefined}
        >
          <Evening evening={evening} />
        </Fold>
      ))}
    </div>
  )
}

function Evening({ evening }: { evening: AlbumEntry }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data: url } = useQuery({
    queryKey: ['photo-url', evening.storage_path],
    queryFn: () => photoUrl(evening.storage_path),
    staleTime: 45 * 60 * 1000,
  })

  async function onForget() {
    setBusy(true)
    try {
      await forgetPhoto(evening.id)
      await queryClient.invalidateQueries({ queryKey: ['my-album'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {url ? (
        <img
          className="album__photo"
          src={url}
          alt={evening.caption ?? t('album.altFallback', { name: evening.round_name })}
          loading="lazy"
        />
      ) : (
        <div className="album__pending" aria-hidden="true" />
      )}

      {evening.taken_by_name && (
        <p className="muted album__holder">
          {t('album.takenBy', { name: evening.taken_by_name })}
        </p>
      )}

      {/* The menu, printed under the photograph the way it would be under a
          picture in a book. Absent rather than empty for a dinner nobody
          recorded a dish for — a heading over nothing says something went
          wrong, and nothing did. */}
      {evening.menu.length > 0 && (
        <ul className="album__menu">
          {evening.menu.map((line, i) => (
            <li key={i}>
              <span className="album__menu-course">{t(`briefs.courseOption.${line.course}`)}</span>
              <span className="album__menu-dish">{line.dish}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Asked, because this may be the last copy in the world: the dinner it
          came from is usually already gone by the time anybody tidies an
          album. Same care the recipe book takes over forgetting a recipe. */}
      {confirming ? (
        <div className="row">
          <button type="button" disabled={busy} onClick={onForget}>
            {t('album.forgetConfirm')}
          </button>
          <button type="button" className="secondary" onClick={() => setConfirming(false)}>
            {t('actions.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className="secondary" onClick={() => setConfirming(true)}>
          {t('album.forget')}
        </button>
      )}
    </div>
  )
}
