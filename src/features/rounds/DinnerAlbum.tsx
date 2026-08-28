import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PhotoError, preparePhoto } from '../../lib/photo'
import { useAuth } from '../../lib/auth'
import type { RoundRow } from './hooks'
import {
  deletePhotoObject,
  getPhotographer,
  hidePhoto,
  listRoundPhotos,
  listTableChefs,
  photoUrl,
  reportPhoto,
  savePhoto,
  setPhotographer,
  uploadPhoto,
  type DinnerPhoto,
} from '../../lib/rpc'

/**
 * One photograph of the table, taken by one named person, and kept by whoever
 * wants to keep it.
 *
 * IT USED TO BE ONE EACH, and the reason that changed is in 0068: everybody
 * uploading produced four near-identical pictures of the same table taken
 * minutes apart, none of them the one anybody would have chosen. One per dinner
 * asks who the photographer is, and the dinner already has an answer — the
 * person whose dinner it is.
 *
 * HANDING THE CAMERA OVER MEANS GIVING IT UP. The Executive Chef can pass it to
 * one named chef, who takes the picture on their own phone; while that stands,
 * the host cannot take or replace it. A right two people hold at once is not a
 * handover, it is a suggestion, and the table would have no way of knowing whose
 * job it actually is — which is why the line under the picture says, to
 * everybody, who holds it.
 *
 * AND NOTHING LANDS IN AN ALBUM BY ITSELF. Keeping is a button, exactly as it is
 * for a recipe (0058): being at a dinner is not choosing to keep a picture of
 * it, and an album where everything was chosen is the only kind worth opening.
 *
 * Every file goes through `preparePhoto` before a byte leaves the browser, and
 * that is not an optimisation. A phone photograph carries GPS coordinates;
 * uploading one untouched publishes the address of somebody's flat to everybody
 * at the dinner. See lib/photo.ts.
 */
export function DinnerAlbum({ round }: { round: RoundRow }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The picker's pending answer. Held rather than applied, because handing the
  // camera over is a decision somebody makes once and then confirms — a select
  // that acts on change would transfer the right while they were still reading
  // the names.
  const [pick, setPick] = useState<string>('')
  const [handedOver, setHandedOver] = useState(false)

  const roundId = round.id
  const isHost = round.host_id === profile?.id
  const delegated = round.photographer_profile_id !== null
  // The host holds the camera only until they give it away. This is the whole
  // of the rule, and it is the same line record_photo enforces.
  const canAdd = delegated
    ? round.photographer_profile_id === profile?.id
    : isHost
  // A finished dinner refuses every write to its own row (0054), and handing
  // over the camera is one. The album stays open; the handover closes with the
  // evening.
  const canDelegate = isHost && round.status !== 'ARCHIVED' && round.status !== 'CANCELLED'

  const { data: photos } = useQuery({
    queryKey: ['rounds', roundId, 'photos'],
    enabled: !!roundId,
    queryFn: () => listRoundPhotos(roundId),
  })

  // Who holds it, in words, to everybody at the table.
  const { data: photographer } = useQuery({
    queryKey: ['rounds', roundId, 'photographer', round.photographer_profile_id],
    enabled: !!roundId,
    queryFn: () => getPhotographer(roundId),
  })

  // Only the host can ask, and only the host has a picker to fill.
  const { data: chefs } = useQuery({
    queryKey: ['rounds', roundId, 'table-chefs'],
    enabled: canDelegate,
    queryFn: () => listTableChefs(roundId),
  })

  // The picker starts on whoever holds it, so it is a statement of the current
  // arrangement rather than an empty box.
  useEffect(() => {
    setPick(round.photographer_profile_id ?? '')
    setHandedOver(false)
  }, [round.photographer_profile_id])

  // One per dinner now. Anything else in the list is a photograph that was
  // taken down, which only the person who added it is shown.
  const photo = photos?.find((p) => !p.hidden) ?? null

  async function onPick(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const stripped = await preparePhoto(file)
      await uploadPhoto(roundId, stripped)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'photos'] })
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

  async function onHandOver() {
    setError(null)
    setBusy(true)
    try {
      await setPhotographer(roundId, pick || null)
      setHandedOver(true)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(t(`album.errors.${raw}`, { defaultValue: raw || t('errors.generic') }))
    } finally {
      setBusy(false)
    }
  }

  async function onKeep(target: DinnerPhoto) {
    setError(null)
    setBusy(true)
    try {
      await savePhoto(target.id)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'photos'] })
      await queryClient.invalidateQueries({ queryKey: ['my-album'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(t(`album.errors.${raw}`, { defaultValue: raw || t('errors.generic') }))
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(target: DinnerPhoto) {
    setError(null)
    try {
      await hidePhoto(target.id)
      // The row is already out of everybody's album; this takes the bytes with
      // it, and a bucket that refuses leaves an object nobody can reach rather
      // than a photograph still on screen.
      await deletePhotoObject(target.storage_path)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'photos'] })
      await queryClient.invalidateQueries({ queryKey: ['my-album'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onReport(target: DinnerPhoto) {
    await reportPhoto(target.id, roundId)
    await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'photos'] })
  }

  const holder = photographer?.real_name ?? null

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      {photo ? (
        <AlbumTile
          photo={photo}
          roundName={round.name}
          canRemove={photo.is_mine || isHost}
          busy={busy}
          onKeep={() => onKeep(photo)}
          onRemove={() => onRemove(photo)}
          onReport={() => onReport(photo)}
        />
      ) : (
        <p className="muted">{t(canAdd ? 'album.empty' : 'album.emptyForGuests')}</p>
      )}

      {/* Whose job it is, said to everybody and not only to the host. Under the
          picture, because that is where the question is asked: somebody looking
          at an empty frame wants to know who they are waiting for. */}
      {holder && (
        <p className="muted album__holder">
          {t(canAdd ? 'album.heldByYou' : 'album.heldBy', { name: holder })}
        </p>
      )}

      {canAdd && (
        <>
          {/* `capture` is deliberately absent: at the end of an evening the
              picture worth keeping was usually taken twenty minutes ago, and
              forcing the camera would hide the camera roll it is in. */}
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
            {busy ? t('album.working') : t(photo ? 'album.replace' : 'album.add')}
          </label>
        </>
      )}

      {/* Handing the camera over: choose, then confirm. Two gestures on purpose
          — the second one is the moment the host stops being able to take the
          photograph, and that is not something to do by brushing a select. */}
      {canDelegate && (
        <div className="stack">
          <label htmlFor={`photographer-${roundId}`}>{t('album.photographer')}</label>
          <div className="row">
            <select
              id={`photographer-${roundId}`}
              value={pick}
              onChange={(e) => {
                setPick(e.target.value)
                setHandedOver(false)
              }}
            >
              <option value="">{t('album.photographerMe')}</option>
              {chefs?.map((chef) => (
                <option key={chef.profile_id} value={chef.profile_id}>
                  {chef.real_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || pick === (round.photographer_profile_id ?? '')}
              onClick={onHandOver}
            >
              {t('album.handOver')}
            </button>
          </div>
          {handedOver && <p className="muted" style={{ margin: 0 }}>{t('album.handedOver')}</p>}
          <p className="muted" style={{ margin: 0 }}>
            {t(delegated ? 'album.photographerHintGiven' : 'album.photographerHint')}
          </p>
        </div>
      )}

      <p className="muted">{t('album.exifNote')}</p>
    </div>
  )
}

/**
 * The picture, fetched through a signed URL rather than a public one.
 *
 * The bucket is private on purpose: a public URL keeps working for anybody who
 * has ever seen it, long after the dinner and the app are done with it. The
 * signature lasts an hour, which is longer than anybody looks at an album and
 * short enough that a link pasted elsewhere dies on its own.
 */
function AlbumTile({
  photo,
  roundName,
  canRemove,
  busy,
  onKeep,
  onRemove,
  onReport,
}: {
  photo: DinnerPhoto
  roundName: string
  canRemove: boolean
  busy: boolean
  onKeep: () => void
  onRemove: () => void
  onReport: () => void
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const { data: url } = useQuery({
    queryKey: ['photo-url', photo.storage_path],
    queryFn: () => photoUrl(photo.storage_path),
    // Comfortably inside the hour the signature lasts, so a tab left open over
    // dinner re-signs before the picture turns into a broken image.
    staleTime: 45 * 60 * 1000,
  })

  /**
   * Saving it to the phone, which is not the same act as keeping it in the
   * album and has to be offered separately: one is a copy in this app, the
   * other is a file that outlives the account.
   *
   * Fetched into a blob first rather than linked with `download`, because the
   * signed URL is on another origin and browsers ignore the attribute across
   * origins — the picture would open in a tab and the button would silently
   * mean something else.
   */
  async function onDownload() {
    if (!url) return
    setSaving(true)
    try {
      const blob = await (await fetch(url)).blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `${roundName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'covertcook'}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } finally {
      setSaving(false)
    }
  }

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

      {/* Two different things to do with a picture, and neither happens on its
          own. Keeping it is the album; saving it is a file on the phone. */}
      {!photo.hidden && (
        <div className="row album__keep">
          {photo.already_saved ? (
            <p className="muted" style={{ margin: 0 }}>{t('album.inYourAlbum')}</p>
          ) : (
            <button type="button" disabled={busy} onClick={onKeep}>
              {t('album.keep')}
            </button>
          )}
          <button type="button" className="secondary" disabled={!url || saving} onClick={onDownload}>
            {t('album.download')}
          </button>
        </div>
      )}
    </figure>
  )
}
