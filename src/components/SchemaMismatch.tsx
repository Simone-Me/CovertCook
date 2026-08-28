import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DATABASE_BEHIND } from '../lib/rpc'

/**
 * "The app is talking to a database that does not have this function."
 *
 * PostgREST says that as `PGRST202`, in the console, in the middle of whatever
 * else is failing at the same time — and the first guess it invites is always
 * that the code is wrong. It almost never is. Locally it means `.env.local` is
 * still pointing at the deployed project; in production it means a deploy went
 * out ahead of its migrations.
 *
 * Both cases are one sentence and one command, so the banner says both. It
 * stays until the page is reloaded rather than fading: the condition has not
 * gone away, and half the app is quietly broken while it holds.
 *
 * It is deliberately not dismissible. There is nothing to do about it from
 * inside the app, and a dismissed banner would leave somebody debugging the
 * symptom again ten minutes later.
 */
export function SchemaMismatch() {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    function onBehind(event: Event) {
      setDetail(String((event as CustomEvent).detail ?? ''))
    }
    window.addEventListener(DATABASE_BEHIND, onBehind)
    return () => window.removeEventListener(DATABASE_BEHIND, onBehind)
  }, [])

  if (!detail) return null

  return (
    <div className="schema-warning" role="alert">
      <strong>{t('errors.databaseBehind.title')}</strong>
      <p>{t('errors.databaseBehind.body')}</p>
      <code>{detail}</code>
    </div>
  )
}
