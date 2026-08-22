import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

// Every screen needs a way back, and it has to be the way *you* came.
//
// The first version only knew how to return to a round page, so anywhere
// without a roundId — the profile above all — had no way back at all: you
// could reach it from a dinner but only leave via the home screen and in
// again. History knows the answer; this asks it.
//
// The fallback matters because history isn't always there: a deep link, a
// reload, or a PWA opened cold starts with nothing behind it. Then it aims
// at the round if we're inside one, and home otherwise — never a dead
// control.
export function BackToTable() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // react-router marks entries it created; index 0 means we arrived here
  // directly and there is nothing of ours to go back to.
  const hasHistory = (location.key !== 'default') && window.history.length > 1

  function goBack() {
    if (hasHistory) navigate(-1)
    else navigate(roundId ? `/rounds/${roundId}` : '/', { replace: true })
  }

  return (
    <button type="button" className="back-link" onClick={goBack}>
      ← {roundId ? t('rounds.backToTable') : t('actions.back')}
    </button>
  )
}
