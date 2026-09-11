import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useRoundMembers } from '../rounds/hooks'
import { listRoundPhotos, photoUrl, type Course, type RoundResult } from '../../lib/rpc'

/**
 * The evening, as one image somebody can put in a group chat.
 *
 * WHY THIS EXISTS AT ALL. It is the only thing in the app that brings new
 * people in. A guest who has just eaten well is the most likely future host
 * there will ever be, and the moment to reach them is now — not with an email
 * campaign, which is the one kind of outbound mail that carries real legal
 * weight, but with a picture they want to post anyway.
 *
 * WHAT IS ON IT IS NOW ASKED, NOT ASSUMED. The card used to be one button with
 * one fixed contents: dinner name, date, menu, fil rouge, winner, and names of
 * no kind ever. The rule behind that is still right — posting a menu publishes
 * the fact that your friends were at a dinner, and they did not agree to that
 * when they agreed to come — but it is a DEFAULT, not something the app should
 * decide on the sender's behalf. The group chat of the eight people who were
 * there is the commonest destination of all, and to them the names are the
 * point. So the button opens four boxes, the two that say something about
 * people start OFF, and the preview under them shows exactly what will leave.
 *
 * DRAWN, NOT SCREENSHOTTED. A screenshot carries whatever was on the screen,
 * at whatever size the phone happens to be, including the parts that are
 * controls rather than content. This is a canvas laid out for the format it
 * will be seen in.
 *
 * THE PHOTOGRAPH TRAVELS BESIDE THE CARD, not inside it: the bucket is private
 * and its signature lasts an hour, so the picture is fetched into a second
 * file and handed to the share sheet with the card. Drawing it onto the canvas
 * would taint it and the export would fail at the moment somebody pressed the
 * button.
 *
 * HOW IT LEAVES. `navigator.share` with a file opens the native sheet, which
 * is where WhatsApp and Instagram already are. Instagram cannot be posted to
 * from a web page by any other route — the sheet hands the image over and the
 * person posts it, which is the normal path and not a limitation worth working
 * around. Where the sheet is not available (most desktops) the image is
 * downloaded instead, which is the same two steps with one more of them.
 */

const W = 1080
const H = 1350 // 4:5 — the tallest a feed will show without cropping.

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  const words = text.split(' ')
  let out = ''
  for (const w of words) {
    const attempt = out ? `${out} ${w}` : w
    if (ctx.measureText(attempt).width > max && out) {
      ctx.fillText(out, x, y)
      return y + 46
    }
    out = attempt
  }
  ctx.fillText(out, x, y)
  return y + 46
}

export function ShareMenuCard({
  roundId,
  roundName,
  dinnerAt,
  dishes,
  filRouge,
  courseLabel,
}: {
  roundId: string
  roundName: string
  dinnerAt: string | null
  dishes: RoundResult[]
  /** The evening's thread, already in words, or null. */
  filRouge: string | null
  courseLabel: (c: Course) => string
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const anchor = useRef<HTMLAnchorElement>(null)

  // What goes on it. The two that say something about other people start off:
  // a card that names everybody by default is a decision taken for eight
  // people by whoever tapped first.
  const [withNames, setWithNames] = useState(false)
  const [withPseudonyms, setWithPseudonyms] = useState(false)
  const [withPhoto, setWithPhoto] = useState(true)
  const [withVote, setWithVote] = useState(true)

  // Both already fetched by this screen, so these are cache hits rather than
  // second requests.
  const { data: members } = useRoundMembers(roundId)
  const { data: photos } = useQuery({
    queryKey: ['rounds', roundId, 'photos'],
    queryFn: () => listRoundPhotos(roundId),
  })

  const photo = photos?.find((p) => !p.hidden) ?? null
  const seats = (members ?? []).filter((m) => m.status === 'ACTIVE' && m.approved)
  // Never more than the server handed over: before the reveal these columns are
  // null, so a tick cannot conjure a name that was withheld.
  const realNames = seats.map((m) => m.display_name).filter((n): n is string => !!n)
  const secretNames = seats.map((m) => m.secret_name).filter((n): n is string => !!n)

  async function draw(): Promise<Blob | null> {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // The cloth. Drawn rather than loaded: an image would need a fetch that
    // can fail at the moment somebody presses the button.
    ctx.fillStyle = '#fbf6ec'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(178, 58, 62, 0.13)'
    ctx.lineWidth = 26
    for (let x = 60; x < W; x += 120) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = 60; y < H; y += 120) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    // The card the menu is printed on.
    const pad = 70
    ctx.fillStyle = 'rgba(255, 253, 248, 0.97)'
    ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2)
    ctx.strokeStyle = 'rgba(60, 90, 105, 0.25)'
    ctx.lineWidth = 2
    ctx.strokeRect(pad + 14, pad + 14, W - pad * 2 - 28, H - pad * 2 - 28)

    const left = pad + 62
    const max = W - pad * 2 - 124
    let y = pad + 130

    ctx.fillStyle = '#2e3a40'
    ctx.textAlign = 'left'
    ctx.font = '600 58px Georgia, serif'
    y = line(ctx, roundName, left, y, max) + 10

    ctx.font = '26px Georgia, serif'
    ctx.fillStyle = 'rgba(46, 58, 64, 0.65)'
    if (dinnerAt) {
      ctx.fillText(
        new Date(dinnerAt).toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        left,
        y,
      )
      y += 46
    }
    if (filRouge) {
      ctx.fillStyle = '#b23a3e'
      ctx.font = 'italic 30px Georgia, serif'
      y = line(ctx, filRouge, left, y + 8, max)
    }

    y += 30
    ctx.strokeStyle = 'rgba(178, 58, 62, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(left + 160, y)
    ctx.stroke()
    y += 60

    // The menu. Served dishes only: a struck-through line needs the legend
    // that explains it, and a picture cannot carry one.
    const served = dishes.filter((d) => d.served)
    const winner = served.find((d) => d.final_rank === 1)
    // How much room the feet of the card need: the signature always, the
    // winner when the vote is on, and a line of names for each list ticked.
    const foot = 90 + (withVote && winner ? 60 : 0) + (withNames ? 46 : 0) + (withPseudonyms ? 46 : 0)

    for (const d of served) {
      ctx.fillStyle = '#2e3a40'
      ctx.font = `${withVote && d === winner ? '600 ' : ''}36px Georgia, serif`
      const before = y
      y = line(ctx, d.dish_name, left, y, max - 40)
      ctx.fillStyle = 'rgba(46, 58, 64, 0.55)'
      ctx.font = '22px Georgia, serif'
      ctx.fillText(courseLabel(d.course), left, before + 30)
      y += 22
      if (y > H - pad - foot - 120) break
    }

    // The feet, from the bottom up, so nothing can collide with the menu.
    let footY = H - pad - 90
    if (withPseudonyms && secretNames.length > 0) {
      ctx.fillStyle = 'rgba(46, 58, 64, 0.65)'
      ctx.font = '24px Georgia, serif'
      line(ctx, `${t('share.underTheNames')}: ${secretNames.join(' · ')}`, left, footY, max)
      footY -= 46
    }
    if (withNames && realNames.length > 0) {
      ctx.fillStyle = 'rgba(46, 58, 64, 0.65)'
      ctx.font = '24px Georgia, serif'
      line(ctx, `${t('share.atTheTable')}: ${realNames.join(' · ')}`, left, footY, max)
      footY -= 46
    }
    if (withVote && winner) {
      ctx.fillStyle = '#b23a3e'
      ctx.font = 'italic 28px Georgia, serif'
      ctx.fillText(t('results.share.winner', { dish: winner.dish_name }), left, footY)
    }

    // The signature. Small, and the only thing on the card that is an advert.
    ctx.fillStyle = 'rgba(46, 58, 64, 0.5)'
    ctx.font = '26px Georgia, serif'
    ctx.fillText('CovertCook · opus35.fr', left, H - pad - 30)

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  }

  // The preview, redrawn whenever a box changes. It is the whole point of the
  // box: ticking "the names" and seeing eight of them appear is the only way
  // to know what is about to be posted, and a share sheet is far too late to
  // find that out.
  useEffect(() => {
    if (!open) return
    let url: string | null = null
    let alive = true
    draw().then((blob) => {
      if (!blob) return
      if (!alive) return
      url = URL.createObjectURL(blob)
      setPreview(url)
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withNames, withPseudonyms, withVote, dishes, filRouge, members])

  async function onShare() {
    setBusy(true)
    setFallback(false)
    try {
      const blob = await draw()
      if (!blob) return
      const files = [new File([blob], 'covertcook.png', { type: 'image/png' })]

      // The photograph of the table, beside the card rather than on it.
      if (withPhoto && photo) {
        try {
          const url = await photoUrl(photo.storage_path)
          if (url) {
            const shot = await (await fetch(url)).blob()
            files.push(new File([shot], 'table.jpg', { type: shot.type || 'image/jpeg' }))
          }
        } catch {
          // The card still goes. A picture that could not be fetched is not a
          // reason to send nothing.
        }
      }

      // canShare with the files, not just navigator.share: several browsers
      // expose share and then reject files, and finding out after drawing is
      // how you get a button that does nothing.
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title: roundName })
        return
      }
      // One file at a time is all some sheets take; the card is the one that
      // matters, so it is the one that falls back.
      if (files.length > 1 && navigator.canShare?.({ files: [files[0]] })) {
        await navigator.share({ files: [files[0]], title: roundName })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = anchor.current
      if (a) {
        a.href = url
        a.download = `${roundName.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.png`
        a.click()
      }
      setFallback(true)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      // A cancelled share sheet lands here and is not a failure worth saying
      // anything about.
    } finally {
      setBusy(false)
    }
  }

  const options = [
    {
      key: 'names',
      on: withNames,
      set: setWithNames,
      label: t('share.realNames'),
      hint: t('share.realNamesHint'),
      off: realNames.length === 0,
    },
    {
      key: 'pseudonyms',
      on: withPseudonyms,
      set: setWithPseudonyms,
      label: t('share.pseudonyms'),
      hint: t('share.pseudonymsHint'),
      off: secretNames.length === 0,
    },
    {
      key: 'photo',
      on: withPhoto,
      set: setWithPhoto,
      label: t('share.photo'),
      hint: t('share.photoHint'),
      off: !photo,
    },
    {
      key: 'vote',
      on: withVote,
      set: setWithVote,
      label: t('share.results'),
      hint: t('share.resultsHint'),
      off: false,
    },
  ]

  return (
    <div className="stack">
      <button
        type="button"
        className={open ? '' : 'secondary'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t('results.share.button')}
      </button>

      {/* Under the button, in the page, rather than in a sheet that has already
          taken the decision out of your hands. */}
      {open && (
        <div className="paper stack sharebox">
          <p className="muted" style={{ margin: 0 }}>{t('share.what')}</p>

          {options.map((opt) => (
            <label key={opt.key} className={`sharebox__opt${opt.off ? ' is-off' : ''}`}>
              <input
                type="checkbox"
                checked={opt.on && !opt.off}
                disabled={opt.off}
                onChange={(e) => opt.set(e.target.checked)}
              />
              <span>
                <strong>{opt.label}</strong>
                <span className="muted"> — {opt.hint}</span>
              </span>
            </label>
          ))}

          {preview && (
            <img className="sharebox__card" src={preview} alt={t('results.share.button')} />
          )}

          <div className="row">
            <button type="button" disabled={busy} onClick={onShare}>
              {t('share.send')}
            </button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>
              {t('actions.cancel')}
            </button>
          </div>

          <p className="muted" style={{ margin: 0 }}>{t('results.share.note')}</p>
          {fallback && <p className="muted">{t('results.share.downloaded')}</p>}
        </div>
      )}

      <a ref={anchor} style={{ display: 'none' }} aria-hidden="true" />
    </div>
  )
}
