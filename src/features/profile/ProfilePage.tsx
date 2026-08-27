import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BackToTable } from '../../components/BackToTable'
import { InlineConfirm } from '../../components/InlineConfirm'
import { Fold } from '../../components/Fold'
import { FoodLabel } from '../../components/FoodLabel'
import { FoodTagGrid } from '../../components/FoodTagGrid'
import { ALLERGENS, DIETS, OTHER_CODE, isFoodCode } from '../../lib/foodTags'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { type SupportedLocale } from '../../lib/i18n'
import { cancelAccountDeletion, requestAccountDeletion, type DietaryKind } from '../../lib/rpc'
import {
  currentPushState,
  diagnosePush,
  disablePush,
  enablePush,
  resendSubscription,
  type PushDiagnosis,
  type PushState,
} from '../../lib/push'
import { sendTestPush, type TestPushResult } from '../../lib/rpc'

interface DietaryRow {
  id: string
  kind: DietaryKind
  label: string
  note: string | null
}

// Everything about you rather than about a dinner. Until now this had no
// home at all: the address you signed up with was invisible, and dietary
// restrictions could only be set once, during sign-up, with no way back —
// which is the wrong shape for the one thing in this app that has to be
// right, since every brief in every round is validated against it.
export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const { profile, session, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  const [openSet, setOpenSet] = useState<'allergy' | 'diet' | null>(null)
  const [draftCodes, setDraftCodes] = useState<string[]>([])
  const [draftTyped, setDraftTyped] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [push, setPush] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [confirmingDeletion, setConfirmingDeletion] = useState(false)

  const deletionDue = profile?.deletion_requested_at
    ? new Date(new Date(profile.deletion_requested_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null

  async function onRequestDeletion() {
    setError(null)
    setBusy(true)
    try {
      await requestAccountDeletion()
      setConfirmingDeletion(false)
      await refreshProfile()
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      // The one refusal worth translating: a dinner cannot lose the person
      // running it halfway through.
      setError(message.includes('hosting_a_live_round') ? t('account.hostingBlocks') : message)
    } finally {
      setBusy(false)
    }
  }

  async function onCancelDeletion() {
    setError(null)
    setBusy(true)
    try {
      await cancelAccountDeletion()
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  // Asked, never assumed: the answer differs between this phone in a Safari
  // tab and the same phone with the app on its home screen.
  useEffect(() => {
    let stale = false
    currentPushState().then((state) => {
      if (!stale) setPush(state)
    })
    return () => {
      stale = true
    }
  }, [])

  // Two facts, one switch. The browser holds an address for this device; the
  // account holds the decision, for every device and every dinner. Subscribed
  // here but switched off there reads as off, because that is what the person
  // asked for on whichever device they asked on.
  const notificationsAllowed = profile?.notifications_enabled !== false
  const shownPush: PushState | 'checking' =
    push === null ? 'checking' : push === 'on' && !notificationsAllowed ? 'off' : push

  async function onTogglePush() {
    setError(null)
    setPushBusy(true)
    try {
      setPush(shownPush === 'on' ? await disablePush() : await enablePush())
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setPushBusy(false)
    }
  }

  const { data: entries } = useQuery({
    queryKey: ['dietary', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dietary_entries')
        .select('id,kind,label,note')
        .order('kind', { ascending: true })
      if (error) throw error
      return data as DietaryRow[]
    },
  })

  const kindsFor = (which: 'allergy' | 'diet'): DietaryKind[] =>
    which === 'allergy' ? ['ALLERGY_SEVERE', 'ALLERGY_MILD'] : ['DIET']

  // Opening loads what is stored into a draft. Closing the other one first is
  // the whole point of the switch: two open panels are two sets of pending
  // changes, and only one of them would ever get confirmed.
  function beginEditing(which: 'allergy' | 'diet') {
    if (openSet === which) {
      setOpenSet(null)
      return
    }
    const kinds = kindsFor(which)
    const mine = (entries ?? []).filter((e) => kinds.includes(e.kind))
    setDraftCodes(mine.filter((e) => isFoodCode(e.label)).map((e) => e.label))
    setDraftTyped(mine.filter((e) => !isFoodCode(e.label)).map((e) => e.label))
    setOpenSet(which)
  }

  // One write, at the end, from the difference between what was stored and
  // what the draft says. Saving on every tap made a mis-tap a change to
  // somebody's medical record with no moment to look at it first.
  async function onRemove(id: string) {
    setError(null)
    try {
      const { error } = await supabase.from('dietary_entries').delete().eq('id', id)
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['dietary'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onConfirm() {
    if (!openSet || !profile?.id) return
    const kinds = kindsFor(openSet)
    const stored = (entries ?? []).filter((e) => kinds.includes(e.kind))
    const wanted = [...draftCodes.filter((c) => c !== OTHER_CODE), ...draftTyped]

    const toRemove = stored.filter((e) => !wanted.includes(e.label)).map((e) => e.id)
    const toAdd = wanted.filter((label) => !stored.some((e) => e.label === label))

    setError(null)
    setBusy(true)
    try {
      if (toRemove.length) {
        const { error } = await supabase.from('dietary_entries').delete().in('id', toRemove)
        if (error) throw error
      }
      if (toAdd.length) {
        const { error } = await supabase.from('dietary_entries').insert(
          toAdd.map((label) => ({
            profile_id: profile.id,
            // Every allergen the grid records is severe, here as at sign-up.
            kind: openSet === 'allergy' ? 'ALLERGY_SEVERE' : 'DIET',
            label,
          })),
        )
        if (error) throw error
      }
      await queryClient.invalidateQueries({ queryKey: ['dietary'] })
      setOpenSet(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  // The select is controlled by profile.locale, and that value lives in
  // AuthProvider's state — not in react-query. Invalidating a 'profile'
  // query key did nothing, so the stored value never caught up: the UI
  // switched language but the dropdown kept showing the old one, and
  // choosing the language it was already displaying fires no change event
  // at all. Switching back needed a page reload.
  //
  // refreshProfile re-reads the row into that state, which is what the
  // dropdown actually reads from.
  async function onLocale(locale: SupportedLocale) {
    if (!profile?.id) return
    setError(null)
    try {
      const { error } = await supabase.from('profiles').update({ locale }).eq('id', profile.id)
      if (error) throw error
      await i18n.changeLanguage(locale)
      await refreshProfile()
    } catch (err) {
      // Don't leave the interface speaking a language the account doesn't
      // claim — the chat templates and secret names are chosen server-side
      // from the stored column, so the two drifting apart is worse than
      // not switching.
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  // One panel, rendered under whichever heading opened it. Both grids at once
  // is a wall of eighty pictures on a settings page, and opening the second
  // has to close the first, or the button stops being a switch and becomes
  // two independent toggles that look like one.
  const editor = openSet && (
    <div className="card stack">
      {/* Nothing is written while you tap. The old version saved on every
          touch, which made a mis-tap a change to somebody's medical record
          and left no moment to look at what you had chosen. */}
      <FoodTagGrid
        tags={openSet === 'allergy' ? ALLERGENS : DIETS}
        selected={draftCodes}
        onToggle={(code) =>
          setDraftCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
        }
        namespace={openSet === 'allergy' ? 'food.allergen' : 'food.diet'}
        otherValues={draftTyped}
        onOtherAdd={(v) => setDraftTyped((prev) => [...prev, v])}
        onOtherRemove={(v) => setDraftTyped((prev) => prev.filter((x) => x !== v))}
      />

      {openSet === 'allergy' && <p className="muted">{t('dietary.whoSeesIt')}</p>}

      <div className="row">
        <button type="button" disabled={busy} onClick={() => void onConfirm()}>
          {t('actions.confirm')}
        </button>
        <button type="button" className="secondary" onClick={() => setOpenSet(null)}>
          {t('actions.cancel')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('profile.title')}</h1>
      {error && <div className="error">{error}</div>}

      <div className="card stack">
        <div>
          <label>{t('auth.displayName')}</label>
          <strong>{profile?.display_name}</strong>
        </div>
        <div>
          <label>{t('profile.signedInAs')}</label>
          <strong>{session?.user.email}</strong>
        </div>
        {/* The same two buttons the sign-in and sign-up pages use. A dropdown
            here and a pair of buttons there were two controls for one choice,
            and with two languages a dropdown hides half of what it offers
            behind a click. */}
        <LanguageSwitch onChange={(code) => onLocale(code as SupportedLocale)} />
      </div>

      {/* Folded, all three of them. The page had become one long scroll where
          every setting shouted at once; they arrive closed and you open the
          one you came for. The closed row still says what the current answer
          is, or folding would hide the choice as well as the choices. */}
      <Fold title={t('push.title')} aside={t(`push.aside.${shownPush}`)}>
      {/* One switch, and it is per device: this is the phone you are holding,
          not your account. The permission prompt is raised by the button and
          never on load — a refusal cannot be taken back by the site, only by
          the person, in browser settings they will never find. */}
      <div className="card stack">
        <p className="muted">{t(`push.state.${shownPush}`)}</p>
        {(shownPush === 'on' || shownPush === 'off') && (
          <button type="button" disabled={pushBusy} onClick={onTogglePush}>
            {t(shownPush === 'on' ? 'push.turnOff' : 'push.turnOn')}
          </button>
        )}
        <ul className="muted">
          {(t('push.moments', { returnObjects: true }) as string[]).map((moment) => (
            <li key={moment}>{moment}</li>
          ))}
        </ul>
        <p className="muted">{t('push.perRound')}</p>
      </div>

      {/* The one push that goes to the person who asked for it.
          Everything else here happens at a moment in a dinner, to somebody
          else, and cannot be made to happen on purpose — which is why "I get
          no notifications" has been unanswerable. Worse: the audience for a
          phase change excludes whoever caused it, so a host testing on their
          own is correctly and permanently excluded from their own dinner.
          This is the way to find out whether the chain works, without needing
          five friends and a dinner. */}
      <PushTest state={shownPush} />

      </Fold>

      <Fold title={t('dietary.title')} aside={String(entries?.length ?? 0)}>
      {/* Round-wide, not per-dinner: a brief is checked against every
          diner's restrictions, so this list follows you into every round
          you join. Changing it here changes it everywhere. */}
      <p className="muted">{t('profile.dietaryHelp')}</p>

      {/* What is declared, laid out like a menu rather than as a list of rows
          with their category spelled out beside each one: two headings, the
          pictures under them, the word under each picture.

          The button that adds to a set now sits on that set's own heading,
          and the grid opens directly underneath it. It used to be a pair of
          buttons below both lists, which asked the reader to work out which
          button belonged to which heading — and then opened the grid in a
          third place, below both of them, further from the list it was
          about the longer that list got. */}
      <DeclaredList
        title={t('dietary.kind.ALLERGY_SEVERE')}
        empty={t('profile.noneAllergy')}
        entries={(entries ?? []).filter((e) => e.kind !== 'DIET' && e.kind !== 'DISLIKE')}
        onRemove={onRemove}
        action={
          <button
            type="button"
            className={`declared__add${openSet === 'allergy' ? '' : ' secondary'}`}
            aria-expanded={openSet === 'allergy'}
            onClick={() => beginEditing('allergy')}
          >
            {openSet === 'allergy' ? t('actions.close') : t('actions.add')}
          </button>
        }
      >
        {openSet === 'allergy' && editor}
      </DeclaredList>
      <DeclaredList
        title={t('dietary.kind.DIET')}
        empty={t('profile.noneDiet')}
        entries={(entries ?? []).filter((e) => e.kind === 'DIET')}
        onRemove={onRemove}
        tone="diet"
        action={
          <button
            type="button"
            // The same colour as the one above it, deliberately. The green
            // tint was making a point about diets — a rule to respect, not a
            // danger — but the point belongs to the tiles and the labels,
            // which carry it already. On two buttons doing the identical job,
            // one heading apart, two colours only asked what the difference
            // was.
            className={`declared__add${openSet === 'diet' ? '' : ' secondary'}`}
            aria-expanded={openSet === 'diet'}
            onClick={() => beginEditing('diet')}
          >
            {openSet === 'diet' ? t('actions.close') : t('actions.add')}
          </button>
        }
      >
        {openSet === 'diet' && editor}
      </DeclaredList>

      </Fold>

      <Fold title={t('account.title')}>
      {/* Required by both stores and by GDPR, and it has to be here rather
          than in an email to support: the whole point is that it does not
          depend on anybody answering. */}
      <div className="card stack card--danger">
        {deletionDue ? (
          <>
            <p>{t('account.pending', { date: deletionDue.toLocaleDateString(i18n.language) })}</p>
            <button type="button" disabled={busy} onClick={onCancelDeletion}>
              {t('account.keepMyAccount')}
            </button>
          </>
        ) : confirmingDeletion ? (
          <InlineConfirm
            title={t('account.confirmTitle')}
            confirmLabel={t('account.confirmLabel')}
            busy={busy}
            onConfirm={onRequestDeletion}
            onCancel={() => setConfirmingDeletion(false)}
          >
            <ul className="muted">
              {(t('account.consequences', { returnObjects: true }) as string[]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </InlineConfirm>
        ) : (
          <>
            <p className="muted">{t('account.help')}</p>
            <button type="button" className="secondary" onClick={() => setConfirmingDeletion(true)}>
              {t('account.delete')}
            </button>
          </>
        )}
      </div>
      </Fold>

      <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>
        {t('auth.signOut')}
      </button>
    </div>
  )
}


/**
 * One declared set, laid out like a line on a menu: the heading, then the
 * pictures with their names under them.
 *
 * The list this replaces printed the category beside every single row —
 * "Celery — Severe allergy", "Peanuts — Severe allergy" — which is the same
 * word four times and none of it new. Grouping says it once.
 *
 * The empty line is a sentence rather than a blank space: nothing declared and
 * nothing loaded look identical when both are empty, and one of them means a
 * cook can stop worrying.
 *
 * `action` sits on the heading itself — the button that adds to this set,
 * beside the name of the set it adds to — and `children` is what that button
 * opens, directly beneath the list it changes.
 */
function DeclaredList({
  title,
  empty,
  entries,
  onRemove,
  tone,
  action,
  children,
}: {
  title: string
  empty: string
  entries: DietaryRow[]
  onRemove: (id: string) => void
  tone?: 'diet'
  action?: ReactNode
  children?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="declared">
      <div className="declared__head">
        <h3 className={`declared__title${tone === 'diet' ? ' tone-diet' : ''}`}>{title}</h3>
        {action}
      </div>
      {entries.length === 0 ? (
        <p className="declared__empty">
          <em>{empty}</em>
        </p>
      ) : (
        <ul className="declared__list">
          {entries.map((e) => (
            <li key={e.id}>
              <FoodLabel label={e.label} stacked />
              <button
                type="button"
                className="linkish"
                onClick={() => onRemove(e.id)}
                aria-label={`${t('actions.remove')} ${e.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  )
}


/**
 * Where it breaks, said as a place.
 *
 * Two halves, and the order matters. The checks run on this device and cost
 * nothing, so they run when the panel opens: they can already answer four of
 * the seven ways push fails, and three of those need no server at all. Then
 * the button, which is the only half that can prove the whole chain — a
 * notification that actually arrives is the only evidence that every link
 * between a database row and a lock screen is intact.
 *
 * Written to be read out loud to somebody over a phone, because that is what
 * happens to it: each line is a question with a yes or a no, and the failures
 * carry the fix rather than the diagnosis.
 */
function PushTest({ state }: { state: PushState | 'checking' }) {
  const { t } = useTranslation()
  const [report, setReport] = useState<PushDiagnosis | null>(null)
  const [result, setResult] = useState<TestPushResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  async function check() {
    setFailure(null)
    setBusy(true)
    try {
      setReport(await diagnosePush())
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onOpen() {
    setOpen(true)
    await check()
  }

  // Repair, then test. A subscription the server never received is the one
  // fault where the phone and the database each look perfectly fine on their
  // own, and re-sending it is a no-op in every other case — so it is not worth
  // a second button, or a decision anybody has to make.
  async function onTest() {
    setFailure(null)
    setResult(null)
    setBusy(true)
    try {
      await resendSubscription()
      setResult(await sendTestPush())
      setReport(await diagnosePush())
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="secondary" onClick={onOpen}>
        {t('push.test.open')}
      </button>
    )
  }

  const lines: { key: string; ok: boolean | null; detail?: string }[] = report
    ? [
        { key: 'installed', ok: report.standalone },
        { key: 'api', ok: report.supported },
        { key: 'worker', ok: report.serviceWorker === 'active', detail: report.serviceWorker },
        { key: 'permission', ok: report.permission === 'granted', detail: report.permission },
        { key: 'key', ok: report.vapidConfigured },
        { key: 'subscribed', ok: report.subscribed, detail: report.pushService ?? undefined },
        { key: 'server', ok: report.knownToServer },
      ]
    : []

  return (
    <div className="card stack">
      <strong>{t('push.test.title')}</strong>
      <p className="muted">{t('push.test.why')}</p>

      {failure && <div className="error">{failure}</div>}

      <ul className="checklist">
        {lines.map((line) => (
          <li key={line.key} className={line.ok === true ? 'is-ok' : line.ok === false ? 'is-bad' : ''}>
            <span aria-hidden="true">{line.ok === true ? '✓' : line.ok === false ? '✕' : '?'}</span>
            <span>
              {t(`push.test.check.${line.key}`)}
              {line.detail && <span className="muted"> — {line.detail}</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* The first failing line, turned into the thing to do about it. One
          instruction, not seven: a checklist with three crosses on it is a
          diagnosis, and a diagnosis is not a fix. */}
      {report && (
        <p className="muted">
          {t(`push.test.fix.${lines.find((l) => l.ok === false)?.key ?? 'none'}`, { defaultValue: '' })}
        </p>
      )}

      <div className="row">
        <button type="button" className="secondary" disabled={busy} onClick={check}>
          {t('push.test.recheck')}
        </button>
        <button type="button" disabled={busy || state !== 'on'} onClick={onTest}>
          {t('push.test.send')}
        </button>
      </div>

      {/* What the server did, in the server's own numbers. `audience: 0` and
          `sent: 0` are different faults — nothing to send to, versus something
          to send to that refused — and collapsing them into "it didn't work"
          is how this stayed a mystery for a month. */}
      {result && (
        <p className={result.sent > 0 ? 'muted' : 'notice'}>
          {result.sent > 0
            ? t('push.test.sent')
            : result.reason === 'no_subscription_on_server'
              ? t('push.test.noRow')
              : t('push.test.refused', { audience: result.audience })}
          {result.notifications_enabled === false && ` ${t('push.test.accountOff')}`}
        </p>
      )}
    </div>
  )
}
