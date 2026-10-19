import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { BackToTable } from '../../components/BackToTable'
import { invokeFunction } from '../../lib/functions'
import { PhotoError, preparePhoto } from '../../lib/photo'

/**
 * Something went wrong: say what, add a screenshot if it helps, and it lands
 * in the contact inbox (supabase/functions/report-bug) with the page, the
 * version and the browser attached, so nobody has to ask for them.
 *
 * The screenshot goes through the same preparation as an album photograph —
 * shrunk, re-drawn, no location — because a phone screenshot is a phone photo.
 */
export function ReportBugPage() {
  const { t } = useTranslation()
  // Where they were when they pressed the bug, which is the page the bug is
  // on. The header passes it; opened any other way, this page is all we know.
  const from = (useLocation().state as { from?: string } | null)?.from
  const page = window.location.origin + (from ?? window.location.pathname)
  const [message, setMessage] = useState('')
  const [image, setImage] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    setError(null)
    if (!file) return
    try {
      const blob = await preparePhoto(file)
      setImage(blob)
      setPreview(URL.createObjectURL(blob))
    } catch (err) {
      setError(err instanceof PhotoError ? t(`album.errors.${err.problem}`) : t('errors.generic'))
    }
  }

  function clearImage() {
    if (preview) URL.revokeObjectURL(preview)
    setImage(null)
    setPreview(null)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      const encoded = image ? await toBase64(image) : undefined
      await invokeFunction('report-bug', {
        message,
        page,
        userAgent: navigator.userAgent,
        version: __APP_VERSION__,
        image: encoded,
      })
      setSent(true)
      setMessage('')
      clearImage()
    } catch {
      setError(t('report.failed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('report.title')}</h1>
      {sent ? (
        <p>{t('report.thanks')}</p>
      ) : (
        <form className="stack" onSubmit={send}>
          <p className="muted">{t('report.lead')}</p>
          {error && <div className="error">{error}</div>}
          <label htmlFor="report-message">{t('report.what')}</label>
          <textarea
            id="report-message"
            required
            rows={6}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <label htmlFor="report-image">{t('report.photo')}</label>
          {preview ? (
            <div className="stack">
              <img className="alert-photo" src={preview} alt="" />
              <button type="button" className="secondary" onClick={clearImage}>
                {t('report.removePhoto')}
              </button>
            </div>
          ) : (
            <input id="report-image" type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
          )}

          <button type="submit" disabled={sending || !message.trim()}>
            {sending ? t('report.sending') : t('report.send')}
          </button>
        </form>
      )}
    </div>
  )
}

/** The JPEG as plain base64, which is what Resend takes for an attachment. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
