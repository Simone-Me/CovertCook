import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { Link } from 'react-router-dom'
import { Fold } from '../../components/Fold'
import { formatMoment } from '../../lib/datetime'
import { forgetPhoto, myAlbum, photoUrl, type AlbumEntry } from '../../lib/rpc'

/**
 * The evenings you chose to keep.
 *
 * NOTHING IS HERE BY ACCIDENT. Being at a dinner does not put its photograph in
 * your album; pressing add on the results screen does (0068), exactly as it
 * does for a recipe (0058). That is what makes this worth opening — everything
 * in it was chosen — and it is also what makes it survive: each row is a copy,
 * so the dinner being purged three weeks later (0062) takes nothing from here.
 *
 * PRINTS ON A TABLE, TWO ACROSS. It used to be a list of folded rows inside the
 * profile, which made an album of photographs the one place in the app where
 * you could not see a photograph without opening something. On its own page
 * the prints are laid out, and the one you touch lifts to the full width with
 * its menu underneath — the same gesture the setup cards use.
 */
function useAlbum() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['my-album', profile?.id],
    enabled: !!profile?.id,
    queryFn: myAlbum,
  })
}

/** Newest evening first; one with no date goes to the end rather than the top. */
function newestFirst(a: AlbumEntry, b: AlbumEntry) {
  return (b.dinner_at ?? '').localeCompare(a.dinner_at ?? '')
}

export function Album() {
  const { t, i18n } = useTranslation()
  const { data: evenings } = useAlbum()
  const [open, setOpen] = useState<string | null>(null)

  if (!evenings) return <p className="muted">…</p>
  if (evenings.length === 0) return <p className="muted">{t('album.profileEmpty')}</p>

  return (
    <div className="albumgrid">
      {[...evenings].sort(newestFirst).map((evening) => {
        const isOpen = open === evening.id
        return (
          <div key={evening.id} className={`albumcard${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="albumcard__face"
              aria-expanded={isOpen}
              onClick={() => setOpen((cur) => (cur === evening.id ? null : evening.id))}
            >
              {!isOpen && <Print path={evening.storage_path} alt={evening.caption ?? evening.round_name} />}
              <span className="albumcard__name">{evening.round_name}</span>
              {evening.dinner_at && (
                <span className="muted albumcard__date">{formatMoment(evening.dinner_at, i18n.language)}</span>
              )}
            </button>
            {isOpen && (
              <div className="albumcard__body">
                <Evening evening={evening} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The album, folded on the profile: the last three prints, and "see all"
 *  goes to the album's own page, where the prints are big enough to look at. */
export function AlbumFold() {
  const { t } = useTranslation()
  const { data: evenings } = useAlbum()
  return (
    <Fold title={t('album.profileTitle')} aside={evenings ? String(evenings.length) : undefined}>
      <AlbumPreview />
    </Fold>
  )
}

function AlbumPreview() {
  const { t } = useTranslation()
  const { data: evenings } = useAlbum()

  if (!evenings) return <p className="muted">…</p>
  if (evenings.length === 0) return <p className="muted">{t('album.profileEmpty')}</p>

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>{t('album.latest')}</p>
      <Link to="/profile/album" className="albumstrip" aria-label={t('album.seeAll', { count: evenings.length })}>
        {[...evenings]
          .sort(newestFirst)
          .slice(0, 3)
          .map((evening) => (
            <Print key={evening.id} path={evening.storage_path} alt={evening.caption ?? evening.round_name} />
          ))}
      </Link>
      <Link to="/profile/album" className="seeall">
        {t('album.seeAll', { count: evenings.length })} →
      </Link>
    </div>
  )
}

function Print({ path, alt }: { path: string; alt: string }) {
  const { data: url } = useQuery({
    queryKey: ['photo-url', path],
    queryFn: () => photoUrl(path),
    staleTime: 45 * 60 * 1000,
  })
  return url ? (
    <img className="albumprint" src={url} alt={alt} loading="lazy" />
  ) : (
    <span className="albumprint albumprint--pending" aria-hidden="true" />
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
