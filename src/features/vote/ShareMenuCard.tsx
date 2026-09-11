import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course, RoundResult } from '../../lib/rpc'

/**
 * The evening, as one image somebody can put in a group chat.
 *
 * WHY THIS EXISTS AT ALL. It is the only thing in the app that brings new
 * people in. A guest who has just eaten well is the most likely future host
 * there will ever be, and the moment to reach them is now — not with an email
 * campaign, which is the one kind of outbound mail that carries real legal
 * weight, but with a picture they want to post anyway.
 *
 * WHAT IS ON IT, AND WHAT MUST NEVER BE. Dinner name, date, the menu, the fil
 * rouge, the winning dish. NO NAMES — not real ones, not pseudonyms, not the
 * winner's. Posting a menu card publishes the fact that your friends were at a
 * dinner, and they did not agree to that when they agreed to come. A dish name
 * belongs to the evening; a person's name belongs to them.
 *
 * DRAWN, NOT SCREENSHOTTED. A screenshot carries whatever was on the screen,
 * at whatever size the phone happens to be, including the parts that are
 * controls rather than content. This is a canvas laid out for the format it
 * will be seen in.
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
  roundName,
  dinnerAt,
  dishes,
  filRouge,
  courseLabel,
}: {
  roundName: string
  dinnerAt: string | null
  dishes: RoundResult[]
  /** The evening's thread, already in words, or null. */
  filRouge: string | null
  courseLabel: (c: Course) => string
}) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [fallback, setFallback] = useState(false)
  const anchor = useRef<HTMLAnchorElement>(null)

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
    for (const d of served) {
      ctx.fillStyle = '#2e3a40'
      ctx.font = `${d === winner ? '600 ' : ''}36px Georgia, serif`
      const before = y
      y = line(ctx, d.dish_name, left, y, max - 40)
      ctx.fillStyle = 'rgba(46, 58, 64, 0.55)'
      ctx.font = '22px Georgia, serif'
      ctx.fillText(courseLabel(d.course), left, before + 30)
      y += 22
      if (y > H - pad - 220) break
    }

    if (winner) {
      ctx.fillStyle = '#b23a3e'
      ctx.font = 'italic 28px Georgia, serif'
      ctx.fillText(t('results.share.winner', { dish: winner.dish_name }), left, H - pad - 150)
    }

    // The signature. Small, and the only thing on the card that is an advert.
    ctx.fillStyle = 'rgba(46, 58, 64, 0.5)'
    ctx.font = '26px Georgia, serif'
    ctx.fillText('CovertCook · opus35.fr', left, H - pad - 90)

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  }

  async function onShare() {
    setBusy(true)
    setFallback(false)
    try {
      const blob = await draw()
      if (!blob) return
      const file = new File([blob], 'covertcook.png', { type: 'image/png' })
      // canShare with the file, not just navigator.share: several browsers
      // expose share and then reject files, and finding out after drawing is
      // how you get a button that does nothing.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: roundName })
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

  return (
    <div className="stack">
      <button type="button" onClick={onShare} disabled={busy}>
        {t('results.share.button')}
      </button>
      <p className="muted">{t('results.share.note')}</p>
      {fallback && <p className="muted">{t('results.share.downloaded')}</p>}
      <a ref={anchor} style={{ display: 'none' }} aria-hidden="true" />
    </div>
  )
}
