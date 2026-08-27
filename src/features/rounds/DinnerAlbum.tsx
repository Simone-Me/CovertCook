import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PhotoError, preparePhoto } from '../../lib/photo'
import {
  deletePhotoObject,
  hidePhoto,
  listRoundPhotos,
  photoUrl,
  reportPhoto,
  uploadPhoto,
  type DinnerPhoto,
} from '../../lib/rpc'

/**
 * One photograph of the table, per person, per dinner.
 *
 * One each rather than one per dinner, which would immediately have asked who
 * gets to be the photographer. One each says everybody may add theirs, and it
 * bounds what an evening can cost to a number known in advance — the seats.
 *
 * Adding replaces: the control is a switch on a single picture rather than a
 * feed you post into, so somebody who took a better one at the end of the
 * evening swaps it and nothing accumulates.
 *
 * Every file goes through `preparePhoto` before a byte leaves the browser, and
 * that is not an optimisation. A phone photograph carries GPS coordinates;
 * uploading one untouched publishes the address of somebody's flat to everybody
 * at the dinner. See lib/photo.ts.
 */
export function DinnerAlbum({ roundId, isHost }: { roundId: string; isHost: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: photos } = useQuery({
    queryKey: ['rounds', roundId, 'photos'],
    enabled: !!roundId,
    queryFn: () => listRoundPhotos(roundId),
  })

  async function onPick(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const stripped = await preparePhoto(file)
      await uploadPhoto(roundId, stripped)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'photos'] })
      await queryClient.invalidateQueries({ queryKey: ['my-album'] })
    } catch (err) {
      if (err instanceof PhotoError) setError(t(`album.errors.${err.problem}`))
      else {
        const raw = err instanceof Error ? err.message : ''
        setError(t(`album.errors.${raw}`, { defaultValue: raw || t('errors.generic') }))
      }
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function onRemove(photo: DinnerPhoto) {
    setError(null)
    try {
      await hidePhoto(photo.id)
      // The row is already out of everybody's album; this takes the bytes with
      // it, and a bucket that refuses leaves an object nobody can reach rather
      // than a photograph still on screen.
      await deletePhotoObject(photo.storage_path)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'photos'] })
      await queryClient.invalidateQueries({ queryKey: ['my-album'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onReport(photo: DinnerPhoto) {
    await reportPhoto(photo.id, roundId)
    await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'photos'] })
  }

  const mine = photos?.find((p) => p.is_mine)

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      {(photos?.length ?? 0) === 0 && <p className="muted">{t('album.empty')}</p>}

      <div className="album">
        {photos?.map((photo) => (
          <AlbumTile
            key={photo.id}
            photo={photo}
            canRemove={photo.is_mine || isHost}
            onRemove={() => onRemove(photo)}
            onReport={() => onReport(photo)}
          />
        ))}
      </div>

      {/* `capture` is deliberately absent: at the end of an evening the picture
          worth keeping was usually taken twenty minutes ago, and forcing the
          camera would hide the camera roll it is in. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        id={`album-${roundId}`}
        className="album__input"
        disabled={busy}
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <label htmlFor={`album-${roundId}`} className="link-button album__button">
        {busy ? t('album.working') : t(mine ? 'album.replace' : 'album.add')}
      </label>
      <p className="muted">{t('album.exifNote')}</p>
    </div>
  )
}

/**
 * One picture, fetched through a signed URL rather than a public one.
 *
 * The bucket is private on purpose: a public URL keeps working for anybody who
 * has ever seen it, long after the dinner and the app are done with it. The
 * signature lasts an hour, which is longer than anybody looks at an album and
 * short enough that a link pasted elsewhere dies on its own.
 */
function AlbumTile({
  photo,
  canRemove,
  onRemove,
  onReport,
}: {
  photo: DinnerPhoto
  canRemove: boolean
  onRemove: () => void
  onReport: () => void
}) {
  const { t } = useTranslation()
  const { data: url } = useQuery({
    queryKey: ['photo-url', photo.storage_path],
    queryFn: () => photoUrl(photo.storage_path),
    // Comfortably inside the hour the signature lasts, so a tab left open over
    // dinner re-signs before the picture turns into a broken image.
    staleTime: 45 * 60 * 1000,
  })

  return (
    <figure className={`album__tile${photo.hidden ? ' is-hidden' : ''}`}>
      {url ? (
        <img src={url} alt={photo.caption ?? t('album.altFallback', { name: photo.taken_by ?? '' })} loading="lazy" />
      ) : (
        <div className="album__pending" aria-hidden="true" />
      )}
      <figcaption>
        <span className="muted">{photo.taken_by}</span>
        {photo.hidden && <span className="muted"> · {t('album.removed')}</span>}
        <span className="album__actions">
          {!photo.is_mine && !photo.reported && (
            <button type="button" className="chef-remove" title={t('chat.report')} onClick={onReport}>
              ⚑
            </button>
          )}
          {photo.reported && <span className="muted">{t('chat.reported')}</span>}
          {canRemove && !photo.hidden && (
            <button type="button" className="chef-remove" title={t('album.remove')} onClick={onRemove}>
              ×
            </button>
          )}
        </span>
      </figcaption>
    </figure>
  )
}
