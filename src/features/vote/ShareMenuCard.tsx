import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  listRoundPhotos,
  photoUrl,
  type Course,
  type RoundRecipe,
  type RoundResult,
} from '../../lib/rpc'

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
  recipes,
  filRouge,
  courseLabel,
}: {
  roundId: string
  roundName: string
  dinnerAt: string | null
  dishes: RoundResult[]
  /** The evening's recipes, which are where the names live: a result row knows
   *  the dish and the score, and only the recipe knows who wrote it. */
  recipes: RoundRecipe[]
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

  // Already fetched by this screen, so this is the cache rather than a second
  // request.
  const { data: photos } = useQuery({
    queryKey: ['rounds', roundId, 'photos'],
    queryFn: () => listRoundPhotos(roundId),
  })

  const photo = photos?.find((p) => !p.hidden) ?? null
  const { data: shot } = useQuery({
    queryKey: ['photo-url', photo?.storage_path],
    enabled: !!photo,
    queryFn: () => photoUrl(photo?.storage_path as string),
    // Comfortably inside the hour the signature lasts.
    staleTime: 45 * 60 * 1000,
  })

  // The names, per dish rather than as a list at the foot: a menu attributes
  // each line to somebody, and a roll-call at the bottom is a guest list.
  const byBrief = new Map(recipes.map((r) => [r.brief_id, r]))
  const anySecret = recipes.some((r) => r.author_secret_name)
  const anyReal = recipes.some((r) => r.author_display_name)

  /** The line above a dish: the pseudonym, the real name, or both. */
  function attribution(briefId: string): string | null {
    const r = byBrief.get(briefId)
    if (!r) return null
    const secret = withPseudonyms && r.author_secret_name ? `“${r.author_secret_name}”` : ''
    const real = withNames && r.author_display_name ? `(${r.author_display_name})` : ''
    const both = [secret, real].filter(Boolean).join(' ')
    return both || null
  }

  // THE PHOTOGRAPH IS DRAWN INTO THE SHEET, which means it has to be an
  // <img> before the canvas can use it, and it has to be fetched with CORS
  // allowed or the export throws SecurityError on a tainted canvas. Held in a
  // ref rather than in state: it is an input to drawing, not something the
  // page renders, and setting state on load would redraw twice.
  const table = useRef<HTMLImageElement | null>(null)
  const [photoReady, setPhotoReady] = useState(false)
  useEffect(() => {
    table.current = null
    setPhotoReady(false)
    if (!shot) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      table.current = img
      setPhotoReady(true)
    }
    img.onerror = () => {
      // The card still goes out, without it. A picture that will not load is
      // not a reason to send nothing.
      table.current = null
      setPhotoReady(false)
    }
    img.src = shot
  }, [shot])

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
    // What the foot of the card keeps for itself: the signature, and the
    // winner's line when the vote is on.
    const foot = 90 + (withVote && winner ? 56 : 0)
    const floor = H - pad - foot - 40

    /**
     * One entry, written the way a printed menu writes one:
     *
     *     “Chef Courgette” (Simone)
     *     Hachis Parmentier ····················· 13.2 pt
     *     entrée
     *
     * The leader dots are what make a name at one end and a number at the
     * other read as ONE line rather than as two columns — the same trick the
     * carte on screen uses, and the reason the score can sit at the edge of
     * the sheet without looking detached from the dish it belongs to.
     */
    for (const d of served) {
      if (y > floor) break

      const who = attribution(d.brief_id)
      if (who) {
        ctx.fillStyle = 'rgba(46, 58, 64, 0.62)'
        ctx.font = 'italic 24px Georgia, serif'
        ctx.fillText(who, left, y)
        y += 32
      }

      // The score first, because the room it needs decides where the dish name
      // has to stop. The winner's is the one number on the card that is said
      // twice, so it is set apart: bold and italic, in the table's red.
      let scoreWidth = 0
      let score = ''
      if (withVote) {
        score = t('results.points', { points: d.borda_points.toFixed(1) })
        ctx.font = d === winner ? 'italic 600 30px Georgia, serif' : '28px Georgia, serif'
        scoreWidth = ctx.measureText(score).width
      }

      ctx.fillStyle = '#2e3a40'
      ctx.font = `600 36px Georgia, serif`
      const room = max - (scoreWidth ? scoreWidth + 40 : 0)
      let name = d.dish_name
      // Cut rather than wrap: a wrapped name breaks the line the dots are
      // holding together, and the dish is one line on a printed menu.
      while (ctx.measureText(name).width > room && name.length > 4) {
        name = name.slice(0, -2)
      }
      if (name !== d.dish_name) name = `${name}…`
      ctx.fillText(name, left, y)

      if (score) {
        const nameWidth = ctx.measureText(name).width
        // The dots, drawn as a dashed rule on the baseline rather than as a
        // row of full stops: a screen reader is never handed forty periods,
        // and the spacing does not drift with the font.
        ctx.save()
        ctx.strokeStyle = 'rgba(46, 58, 64, 0.35)'
        ctx.lineWidth = 3
        ctx.setLineDash([2, 10])
        ctx.beginPath()
        ctx.moveTo(left + nameWidth + 16, y - 8)
        ctx.lineTo(left + max - scoreWidth - 16, y - 8)
        ctx.stroke()
        ctx.restore()

        ctx.fillStyle = d === winner ? '#b23a3e' : 'rgba(46, 58, 64, 0.75)'
        ctx.font = d === winner ? 'italic 600 30px Georgia, serif' : '28px Georgia, serif'
        ctx.fillText(score, left + max - scoreWidth, y)
      }
      y += 40

      ctx.fillStyle = 'rgba(46, 58, 64, 0.55)'
      ctx.font = 'italic 24px Georgia, serif'
      ctx.fillText(courseLabel(d.course), left, y)
      y += 40
    }

    // THE PHOTOGRAPH GOES ON THE SHEET, not beside it: one image is what a
    // group chat shows, and a second file is something people scroll past. It
    // takes the room the menu left; where the menu filled the sheet it comes
    // back at half width and sits ON the last lines, which is what a
    // photograph laid on a menu actually does.
    if (withPhoto && table.current) {
      const img = table.current
      const room = floor - y - 10
      // Half a sheet of room is enough for a picture worth looking at; below
      // that it comes back at half width and lies on the last lines instead.
      const full = room >= 200
      const w = full ? max : max / 2
      const h = Math.min(full ? room : 320, (w * img.height) / img.width)
      const x = full ? left : left + max - w
      // Full width, it sits at the foot of the menu rather than immediately
      // under it: a photograph floating mid-sheet with white under it reads as
      // a gap somebody forgot to fill.
      const top = full ? floor - h : floor - h

      ctx.save()
      // A white edge and a shadow: it is a print laid on the menu, and without
      // one it reads as a hole cut in the paper.
      ctx.shadowColor = 'rgba(60, 40, 30, 0.35)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 8
      ctx.fillStyle = '#fffcf4'
      ctx.fillRect(x - 10, top - 10, w + 20, h + 20)
      ctx.restore()
      // Cropped to fill rather than squashed: the aspect ratio of somebody's
      // kitchen is not the aspect ratio of the space left on a menu.
      const scale = Math.max(w / img.width, h / img.height)
      const sw = w / scale
      const sh = h / scale
      ctx.drawImage(
        img,
        (img.width - sw) / 2,
        (img.height - sh) / 2,
        sw,
        sh,
        x,
        top,
        w,
        h,
      )
    }

    // The winner, named in words under everything else, and the signature.
    if (withVote && winner) {
      ctx.fillStyle = '#b23a3e'
      ctx.font = 'italic 600 28px Georgia, serif'
      ctx.fillText(t('results.share.winner', { dish: winner.dish_name }), left, H - pad - 90)
    }

    // Small, and the only thing on the card that is an advert.
    ctx.fillStyle = 'rgba(46, 58, 64, 0.5)'
    ctx.font = '26px Georgia, serif'
    ctx.fillText('CovertCook · opus35.fr', left, H - pad - 30)

    // A canvas the photograph tainted cannot be exported at all, which would
    // turn the whole button into a no-op. Answered by drawing again without
    // it: a card without the picture is a card, and silence here would be a
    // button that does nothing.
    try {
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    } catch {
      table.current = null
      return null
    }
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
  }, [open, withNames, withPseudonyms, withPhoto, withVote, photoReady, dishes, recipes, filRouge])

  async function onShare() {
    setBusy(true)
    setFallback(false)
    try {
      // ONE FILE, ALWAYS. The photograph is on the sheet now, so there is
      // nothing to send beside it — and one image is what a group chat shows
      // whole, where a second attachment is something people scroll past.
      const blob = (await draw()) ?? (await draw())
      if (!blob) return
      const files = [new File([blob], 'covertcook.png', { type: 'image/png' })]

      // canShare with the files, not just navigator.share: several browsers
      // expose share and then reject files, and finding out after drawing is
      // how you get a button that does nothing.
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title: roundName })
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
      off: !anyReal,
    },
    {
      key: 'pseudonyms',
      on: withPseudonyms,
      set: setWithPseudonyms,
      label: t('share.pseudonyms'),
      hint: t('share.pseudonymsHint'),
      off: !anySecret,
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
