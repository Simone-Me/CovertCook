import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * The way into a dinner's settings, drawn as crossing cutlery instead of
 * written out. It sits beside the dinner's name, where a word competed with
 * the title for the same line and won attention it didn't deserve.
 *
 * Still by default, moving on hover — the movement is the affordance, so it
 * must not run on its own: a header that animates unprompted on every screen
 * is a distraction the whole page pays for.
 *
 * It is a <video>, not the GIF. Same animation, a fifth of the weight, and —
 * unlike a GIF — it can actually be stopped. `preload="none"` means the file
 * is not fetched at all until somebody points at it, so the still costs 13 KB
 * and the rest is only paid by people who ask for it. The poster is that
 * still, so if the video never loads the control is unchanged.
 */
export function CutleryLink({ to }: { to: string }) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)

  function start() {
    video.current?.play().catch(() => {})
  }

  function stop() {
    const v = video.current
    if (!v) return
    v.pause()
    v.currentTime = 0
  }

  return (
    <Link
      to={to}
      className="cutlery"
      title={t('rounds.settings.title')}
      aria-label={t('rounds.settings.title')}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
    >
      <video
        ref={video}
        className="cutlery__anim"
        src="/cutlery_anim.mp4"
        poster="/cutlery_anim.png"
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      />
    </Link>
  )
}
