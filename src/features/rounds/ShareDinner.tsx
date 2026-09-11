import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { formatMoment } from '../../lib/datetime'
import { listRoundPhotos, photoUrl, type RoundResult } from '../../lib/rpc'
import { useRoundMembers, type RoundRow } from './hooks'

/**
 * Sending the evening to somebody who was not at it.
 *
 * ONE BUTTON WAS NOT ENOUGH, AND A PDF OF EVERYTHING WOULD BE TOO MUCH. What
 * people actually want to send out of a dinner differs by who they are sending
 * it to: the group chat of the people who were there wants the real names and
 * the scores; a friend who was not there wants the menu and the photograph and
 * has no use for eight pseudonyms; and somebody posting it publicly should not
 * be handing out a table of names at all. So the button opens a box of four
 * choices and composes exactly what was ticked.
 *
 * IT IS SHOWN BEFORE IT IS SENT. The preview under the boxes is the whole
 * point of the control: ticking "real names" and seeing the line appear is the
 * only way to know what leaves the phone, and a share sheet is the wrong place
 * to find that out.
 *
 * THE PHOTOGRAPH TRAVELS AS A FILE where the browser will carry one, and is
 * simply left out where it will not — never silently replaced by a link, which
 * would hand a signed URL to a group chat that outlives the signature.
 */
export function ShareDinner({ round, dishes }: { round: RoundRow; dishes: RoundResult[] }) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const locale = profile?.locale ?? i18n.language ?? 'en'

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // What goes in. The two that say something about people start OFF: a share
  // that names everybody by default is a decision made for eight other people
  // by whoever tapped first.
  const [withNames, setWithNames] = useState(false)
  const [withPseudonyms, setWithPseudonyms] = useState(false)
  const [withPhoto, setWithPhoto] = useState(true)
  const [withResults, setWithResults] = useState(true)

  const { data: members } = useRoundMembers(round.id)
  const { data: photos } = useQuery({
    queryKey: ['rounds', round.id, 'photos'],
    queryFn: () => listRoundPhotos(round.id),
  })

  const photo = photos?.find((p) => !p.hidden) ?? null
  const seats = (members ?? []).filter((m) => m.status === 'ACTIVE')

  // Real names only where this reader was actually given them — after the
  // reveal they are on the roster, before it the column is null and the line
  // simply does not appear. The tick can never conjure a name the server
  // withheld.
  const realNames = seats.map((m) => m.display_name).filter((n): n is string => !!n)
  const secretNames = seats.map((m) => m.secret_name).filter((n): n is string => !!n)

  // Only what reached the table. A dish nobody could taste has no place in a
  // souvenir of the evening, and it has no rank either (0057).
  const served = dishes.filter((d) => d.served)
  const winner = served.find((d) => d.final_rank === 1)

  /** The evening, in the words that were ticked. */
  function compose(): string {
    const lines: string[] = [round.name]
    if (round.dinner_at) lines.push(formatMoment(round.dinner_at, locale))
    lines.push('')

    for (const dish of served) {
      const course =
        round.slot_mode === 'CATEGORIES' ? `${t(`briefs.courseOption.${dish.course}`)} — ` : ''
      const points = withResults ? ` (${t('results.points', { points: dish.borda_points.toFixed(1) })})` : ''
      lines.push(`${course}${dish.dish_name}${points}`)
    }

    if (withResults && winner) {
      lines.push('')
      lines.push(`${t('results.winner')}: ${winner.dish_name}`)
    }

    if (withNames && realNames.length > 0) {
      lines.push('')
      lines.push(`${t('share.atTheTable')}: ${realNames.join(', ')}`)
    }

    if (withPseudonyms && secretNames.length > 0) {
      lines.push('')
      lines.push(`${t('share.underTheNames')}: ${secretNames.join(', ')}`)
    }

    return lines.join('\n')
  }

  const preview = compose()

  async function onSend() {
    setNote(null)
    setBusy(true)
    try {
      const text = preview
      let files: File[] | undefined

      if (withPhoto && photo) {
        // Fetched into a file rather than linked: the bucket is private and
        // its signature lasts an hour, so a URL in a group chat is a picture
        // that dies without warning (see AlbumTile.onDownload for the same
        // reason, the other way round).
        try {
          const url = await photoUrl(photo.storage_path)
          if (url) {
            const blob = await (await fetch(url)).blob()
            files = [new File([blob], 'covertcook.jpg', { type: blob.type || 'image/jpeg' })]
          }
        } catch {
          files = undefined
        }
      }

      // `navigator.share` is absent on every desktop browser and on iOS outside
      // a secure context, so the clipboard is not a fallback for a failure —
      // it is the ordinary path for half the people who will use this.
      const sheet = 'share' in navigator
      if (sheet && files && navigator.canShare?.({ files })) {
        await navigator.share({ text, files })
        setNote(null)
      } else if (sheet) {
        await navigator.share({ text })
        // Said only when something was asked for and could not travel, so the
        // sender knows the picture is not in what they just sent.
        setNote(files ? t('share.photoNotSent') : null)
      } else {
        await navigator.clipboard.writeText(text)
        setNote(t('share.copied'))
      }
    } catch {
      // A share sheet the sender closed is not an error, and there is nothing
      // to say about it.
    } finally {
      setBusy(false)
    }
  }

  const options: { on: boolean; set: (v: boolean) => void; label: string; hint?: string; off?: boolean }[] = [
    {
      on: withNames,
      set: setWithNames,
      label: t('share.realNames'),
      hint: t('share.realNamesHint'),
      off: realNames.length === 0,
    },
    {
      on: withPseudonyms,
      set: setWithPseudonyms,
      label: t('share.pseudonyms'),
      hint: t('share.pseudonymsHint'),
      off: secretNames.length === 0,
    },
    {
      on: withPhoto,
      set: setWithPhoto,
      label: t('share.photo'),
      hint: t('share.photoHint'),
      off: !photo,
    },
    {
      on: withResults,
      set: setWithResults,
      label: t('share.results'),
      hint: t('share.resultsHint'),
    },
  ]

  return (
    <div className="stack">
      <button
        type="button"
        className={open ? '' : 'secondary'}
        aria-expanded={open}
        onClick={() => {
          setNote(null)
          setOpen((v) => !v)
        }}
      >
        {t('share.dinner')}
      </button>

      {/* Under the button, in the page, rather than in a sheet that has already
          taken the decision out of your hands. */}
      {open && (
        <div className="paper stack sharebox">
          <p className="muted" style={{ margin: 0 }}>{t('share.what')}</p>

          {options.map((opt) => (
            <label key={opt.label} className={`sharebox__opt${opt.off ? ' is-off' : ''}`}>
              <input
                type="checkbox"
                checked={opt.on && !opt.off}
                disabled={opt.off}
                onChange={(e) => opt.set(e.target.checked)}
              />
              <span>
                <strong>{opt.label}</strong>
                {opt.hint && <span className="muted"> — {opt.hint}</span>}
              </span>
            </label>
          ))}

          {/* What will actually leave the phone. */}
          <pre className="sharebox__preview">{preview}</pre>

          <div className="row">
            <button type="button" disabled={busy} onClick={onSend}>
              {t('share.send')}
            </button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>
              {t('actions.cancel')}
            </button>
          </div>

          {note && <p className="notice">{note}</p>}
        </div>
      )}
    </div>
  )
}
