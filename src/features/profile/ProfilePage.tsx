import { useEffect, useState } from 'react'
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
import { currentPushState, disablePush, enablePush, type PushState } from '../../lib/push'

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

  const [set, setSet] = useState<'allergy' | 'diet'>('allergy')
  const [otherOpen, setOtherOpen] = useState(false)
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

  // What is already stored, split the way the grid needs it: codes drive the
  // tiles, typed labels are listed underneath because no picture can stand for
  // them.
  const kindsInSet: DietaryKind[] =
    set === 'allergy' ? ['ALLERGY_SEVERE', 'ALLERGY_MILD'] : ['DIET']
  const inSet = (entries ?? []).filter((e) => kindsInSet.includes(e.kind))
  const chosenCodes = inSet.filter((e) => isFoodCode(e.label)).map((e) => e.label)
  const typedLabels = inSet.filter((e) => !isFoodCode(e.label)).map((e) => e.label)
  if (otherOpen && !chosenCodes.includes(OTHER_CODE)) chosenCodes.push(OTHER_CODE)

  async function onToggleTag(code: string) {
    if (!profile?.id) return
    // The Other tile has nothing to store on its own: it opens the field, and
    // what gets stored is whatever is typed into it.
    if (code === OTHER_CODE) {
      setOtherOpen((v) => !v)
      return
    }
    const existing = inSet.find((e) => e.label === code)
    setError(null)
    setBusy(true)
    try {
      const { error } = existing
        ? await supabase.from('dietary_entries').delete().eq('id', existing.id)
        : await supabase.from('dietary_entries').insert({
            profile_id: profile.id,
            // Every allergen the grid records is severe, here as at sign-up.
            kind: set === 'allergy' ? 'ALLERGY_SEVERE' : 'DIET',
            label: code,
          })
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['dietary'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function onAddTyped(value: string) {
    if (!profile?.id || !value.trim()) return
    setError(null)
    setBusy(true)
    try {
      const { error } = await supabase.from('dietary_entries').insert({
        profile_id: profile.id,
        kind: set === 'allergy' ? 'ALLERGY_SEVERE' : 'DIET',
        label: value.trim(),
      })
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['dietary'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

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

      </Fold>

      <Fold title={t('dietary.title')} aside={String(entries?.length ?? 0)}>
      {/* Round-wide, not per-dinner: a brief is checked against every
          diner's restrictions, so this list follows you into every round
          you join. Changing it here changes it everywhere. */}
      <p className="muted">{t('profile.dietaryHelp')}</p>

      <div className="stack">
        {entries?.length === 0 && <p className="muted">{t('profile.noRestrictions')}</p>}
        {entries?.map((e) => (
          <div key={e.id} className="card row" style={{ justifyContent: 'space-between' }}>
            <span>
              <FoodLabel label={e.label} />
              <span className="muted"> — {t(`dietary.kind.${e.kind}`)}</span>
            </span>
            <button type="button" className="secondary" onClick={() => onRemove(e.id)}>
              {t('actions.remove')}
            </button>
          </div>
        ))}
      </div>

      {/* The same grid as sign-up, from the same file. A free-text field here
          and a grid there meant the two screens could disagree about what an
          allergen is called — and only one of the two spellings was ever
          matched against a dish. */}
      <div className="card stack">
        <div className="row">
          <button
            type="button"
            className={set === 'allergy' ? '' : 'secondary'}
            aria-pressed={set === 'allergy'}
            onClick={() => setSet('allergy')}
          >
            {t('dietary.kind.ALLERGY_SEVERE')}
          </button>
          <button
            type="button"
            className={set === 'diet' ? '' : 'secondary'}
            aria-pressed={set === 'diet'}
            onClick={() => setSet('diet')}
          >
            {t('dietary.kind.DIET')}
          </button>
        </div>

        <FoodTagGrid
          tags={set === 'allergy' ? ALLERGENS : DIETS}
          selected={chosenCodes}
          onToggle={onToggleTag}
          namespace={set === 'allergy' ? 'food.allergen' : 'food.diet'}
          otherValues={typedLabels}
          onOtherAdd={(value) => void onAddTyped(value)}
        />
      </div>

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
