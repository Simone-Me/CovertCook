import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { formatMoment } from '../../lib/datetime'
import { myAlbum, photoUrl, type AlbumEntry } from '../../lib/rpc'

/**
 * Every evening, in one place.
 *
 * Grouped by dinner rather than laid out as one long grid, because that is how
 * an album is indexed in somebody's head: not "photo 47" but "the one at
 * Marta's in March". The heading is the dinner, and it links back to it while
 * the dinner still exists.
 *
 * This is the argument for eventually deleting old dinners, and it has to exist
 * and be used before that argument is true: a recipe worth keeping is in a
 * book, an evening worth remembering is in an album. Deleting first would prove
 * it false.
 */
export function Album() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()

  const { data: photos } = useQuery({
    queryKey: ['my-album', profile?.id],
    enabled: !!profile?.id,
    queryFn: myAlbum,
  })

  if (!photos || photos.length === 0) {
    return <p className="muted">{t('album.profileEmpty')}</p>
  }

  // Already ordered newest dinner first by the RPC, so grouping in order
  // preserves that without a second sort.
  const evenings: { roundId: string; name: string; at: string | null; photos: AlbumEntry[] }[] = []
  for (const photo of photos) {
    const last = evenings[evenings.length - 1]
    if (last && last.roundId === photo.round_id) last.photos.push(photo)
    else evenings.push({ roundId: photo.round_id, name: photo.round_name, at: photo.dinner_at, photos: [photo] })
  }

  return (
    <div className="stack">
      {evenings.map((evening) => (
        <div key={evening.roundId} className="stack">
          <h3 className="album__evening">
            <Link to={`/rounds/${evening.roundId}`}>{evening.name}</Link>
            {evening.at && <span className="muted"> · {formatMoment(evening.at, i18n.language)}</span>}
          </h3>
          <div className="album">
            {evening.photos.map((photo) => (
              <ProfileTile key={photo.id} photo={photo} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProfileTile({ photo }: { photo: AlbumEntry }) {
  const { t } = useTranslation()
  const { data: url } = useQuery({
    queryKey: ['photo-url', photo.storage_path],
    queryFn: () => photoUrl(photo.storage_path),
    staleTime: 45 * 60 * 1000,
  })

  return (
    <figure className="album__tile">
      {url ? (
        <img src={url} alt={photo.caption ?? t('album.altFallback', { name: photo.round_name })} loading="lazy" />
      ) : (
        <div className="album__pending" aria-hidden="true" />
      )}
    </figure>
  )
}
