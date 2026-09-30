import { useTranslation } from 'react-i18next'
import type { RoundStatus } from '../../lib/rpc'
import { themeMark } from '../../lib/themes'
import { Icon } from '../../components/Icon'
import { Envelope } from '../rounds/Envelope'
import { HostPass } from '../rounds/HostAction'
import { RoundProgress } from '../rounds/RoundProgress'
import { TableProps } from '../rounds/TableProps'
import { ChainCircle } from '../rounds/ChainCircle'
import { PRESETS } from '../../lib/roundSetup'
import { ChefSheet } from '../rounds/ChefSheet'
import { Answer } from '../rounds/CreateWithChef'
import { useSetupSummary } from '../rounds/setupSummary'
import { CHAIN, COURSES, MESSAGE_CHOICES, POINTS, WINNER, chef, type ChefKey } from './fixture'

/**
 * THE SCREENS OF THE GUIDED DINNER.
 *
 * Drawn from the same pieces as the real ones — the envelope, the pass, the
 * progress bar, the ring, the menu card — and fed a dinner that exists only
 * here. Never the real pages with their data swapped out: those read straight
 * from the server, and teaching all of them to accept a pretend dinner would
 * put the real game at risk for a picture that looks the same.
 *
 * So when a real screen changes, the one here does not follow by itself. The
 * pieces it borrows do; the layout around them is this file's to keep up.
 */

export interface ScreenProps {
  phase: RoundStatus
  /** Has the story got as far as this step? */
  reached: (id: string) => boolean
  /** Which of the offered messages was sent, once one has been. */
  sent: number | null
}

function Back() {
  const { t } = useTranslation()
  return (
    <button type="button" className="back-link" data-tour="back">
      ← {t('rounds.backToTable')}
    </button>
  )
}

export function CreateScreen({ reached }: ScreenProps) {
  const { t } = useTranslation()
  const summary = useSetupSummary()
  const result = reached('createGo')
  const classic = PRESETS.find((p) => p.key === 'CLASSIC')!.setup!
  return (
    <div className="stack sheet">
      <h1>{t('rounds.create')}</h1>
      <p className="muted">{t('rounds.chef.lead')}</p>
      {!result ? (
        <ChefSheet step="start" inline>
          <p className="chefsheet__say">{t('rounds.chef.start')}</p>
          <Answer label={t('rounds.presets.CLASSIC')} hint={t('rounds.chef.CLASSICHint')} tour="classic" />
          <Answer label={t('rounds.presets.QUESTIONS')} hint={t('rounds.chef.QUESTIONSHint')} />
          <Answer label={t('rounds.presets.MANUAL')} hint={t('rounds.chef.MANUALHint')} />
          <Answer label={t('rounds.presets.FOR_SOMEONE')} hint={t('rounds.presets.soon')} soon />
        </ChefSheet>
      ) : (
        <ChefSheet step="result" inline>
          <p className="questions__step">{t('rounds.chef.result')}</p>
          <p className="chefsheet__say chefsheet__say--title">{t('rounds.presets.CLASSIC')}</p>
          <p className="chefsheet__hint">{t('rounds.presets.CLASSICHint')}</p>
          <p className="muted chefsheet__summary">
            {summary(classic)} · {t('tutorial.filRouge')}
          </p>
          <div>
            <label htmlFor="tour-name">{t('rounds.name')}</label>
            <input id="tour-name" readOnly value={t('tutorial.dinnerName')} />
          </div>
          <div className="row">
            <button type="button" data-tour="create">
              {t('rounds.createIt')}
            </button>
            <button type="button" className="secondary">
              {t('rounds.presets.tweak')}
            </button>
          </div>
        </ChefSheet>
      )}
    </div>
  )
}

export function TableScreen({ phase, reached }: ScreenProps) {
  const { t } = useTranslation()
  const passOpen = reached('tableInvite')
  const friendsIn = reached('tableChefs')
  const inesIn = reached('tableClose')
  const rosterOpen = reached('tableAccept') && !reached('tableMenu')
  const composed = reached('tableRoulette')
  const dealt = reached('tableWrite')
  const assigned = reached('tableAssigned')
  const seats = inesIn ? 4 : friendsIn ? 3 : 1
  const resultsOpen = phase === 'RESULTS'

  // Where the button at the foot of the pass appears: only once the thing it
  // closes is actually done, as on the real table.
  const advance =
    (phase === 'OPEN' && inesIn) ||
    (phase === 'LOCKED' && dealt) ||
    phase === 'ASSIGNED' ||
    phase === 'DINNER' ||
    (phase === 'VOTING' && reached('tableResults'))


  return (
    <div className="cloth table-scene theme-checks tour__table">
      <TableProps status={phase} />
      <div className="stack" style={{ position: 'relative', zIndex: 2, gap: 11 }}>
        <div className="paper">
          <h1 style={{ margin: 0 }}>
            {themeMark('FOOD')} {t('tutorial.dinnerName')}
          </h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>{t('tutorial.filRouge')}</p>
          <p className="muted" style={{ margin: '2px 0 0' }}>{t('rounds.seatCount', { count: seats })}</p>
          {phase === 'ASSIGNED' && (
            <p className="muted dinnercountdown">
              ⏳ {t('rounds.countdown.line', { when: t('rounds.countdown.days', { d: 5, h: 3 }) })}
            </p>
          )}
        </div>

        <div className="paper">
          <RoundProgress round={{ status: phase, voting_mode: 'LIVE' }} isHost />
        </div>

        <div data-tour="pass">
          <HostPass status={phase} waiting={passOpen}>
            {phase === 'OPEN' && (
              <div className="stack">
                <span className="pass__section-title">{t('rounds.actions.fillTable')}</span>
                <label>{t('rounds.shareLink')}</label>
                <div className="row">
                  <code style={{ fontSize: 18, letterSpacing: '0.08em' }}>{t('tutorial.code')}</code>
                  <button type="button" className="secondary">{t('rounds.copyCode')}</button>
                </div>
                <label htmlFor="tour-invite">{t('rounds.invitations.invite')}</label>
                <div className="row">
                  <input id="tour-invite" readOnly value={friendsIn ? '' : t('tutorial.inviteName')} />
                  <button type="button" className="secondary" data-tour="invite">
                    {t('actions.add')}
                  </button>
                </div>
                {friendsIn && <p className="muted" style={{ margin: 0 }}>{t('tutorial.friendsIn')}</p>}
              </div>
            )}

            {phase === 'LOCKED' && (
              <div className="stack">
                {/* The menu is composed once, before the roulette; after it
                    the pass is about the assignment alone. */}
                {!dealt && (
                  <>
                  <span className="pass__section-title">{t('rounds.menu.title')}</span>
                  <div className="row">
                    <button type="button" className="secondary">
                      {t('tutorial.menuFree')}
                    </button>
                    <button type="button" className={composed ? '' : 'secondary'} data-tour="menuCourses">
                      {t('tutorial.menuCourses')}
                    </button>
                  </div>
                  {composed && (
                    <ol className="menucard__list">
                      {COURSES.map((c) => (
                        <li key={c} className="menucard__course">
                          <span className="menucard__name">{t(`briefs.courseOption.${c}`)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                    <hr className="pass__rule" />
                  </>
                )}
                <span className="pass__section-title">{t('rounds.assignment.title')}</span>
                <p className="muted" style={{ margin: 0 }}>
                  {dealt ? t('rounds.assignment.ready') : t('rounds.assignment.explain')}
                </p>
                {!dealt && (
                  <button type="button" data-tour="roulette">
                    {t('rounds.assignment.generate')}
                  </button>
                )}
              </div>
            )}

            {phase === 'VOTING' && (
              <p className="muted" style={{ margin: 0 }}>
                {t('vote.progress', { voted: reached('tableResults') ? 4 : 1, eligible: 4 })}
              </p>
            )}

            {resultsOpen && <p className="muted" style={{ margin: 0 }}>{t('vote.published')}</p>}

            {advance && (
              <div className="stack pass__advance">
                <hr className="pass__rule" />
                <button type="button" data-tour="advance">
                  {t(`rounds.pass.go.${phase}`)}
                </button>
              </div>
            )}
          </HostPass>
        </div>

        <div data-tour="envChefs">
          <Envelope
            icon={<Icon name="chefs" />}
            name={t('rounds.drawers.chefs')}
            meta={`${t('rounds.chefCount', { count: seats })} — ${t('rounds.executiveChef')} : ${chef('you').secret}`}
            badge={friendsIn && !inesIn ? 1 : undefined}
            tilt={1}
            onOpen={() => {}}
          >
            {rosterOpen ? (
              <div className="stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>
                    {chef('you').secret} <span className="muted">({t('tutorial.you')})</span>
                  </strong>
                </div>
                {/* While the door is open everybody else is under the marker —
                    the host included — so arrival order says nothing (0032). */}
                {(['giulia', 'marco'] as ChefKey[]).concat(inesIn ? ['ines'] : []).map((k) => (
                  <div key={k}>
                    <span className="redact">{chef(k).secret}</span>
                  </div>
                ))}
                {!inesIn && (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {chef('ines').secret} <span className="badge">{t('rounds.pendingApproval')}</span>
                    </span>
                    <button type="button" data-tour="accept">
                      {t('actions.approve')}
                    </button>
                  </div>
                )}
              </div>
            ) : undefined}
          </Envelope>
        </div>
        <div data-tour="envOrder">
          <Envelope
            icon={<Icon name="myRecipe" />}
            name={t('rounds.drawers.myRecipe')}
            meta={t('rounds.drawers.myRecipeMeta')}
            waitingFor={assigned ? undefined : t('rounds.waiting.assignment')}
            tilt={2}
            onOpen={() => {}}
          />
        </div>
        <div data-tour="envDish">
          <Envelope
            icon={<Icon name="received" />}
            name={t('rounds.drawers.received')}
            meta={t('rounds.drawers.receivedMeta')}
            waitingFor={assigned ? undefined : t('rounds.waiting.assignment')}
            tilt={3}
            onOpen={() => {}}
          />
        </div>
        <div data-tour="envMessages">
          <Envelope
            icon={<Icon name="messages" />}
            name={t('rounds.drawers.messages')}
            meta={t('rounds.drawers.messagesMeta')}
            badge={reached('tableMessages') && !reached('messagesSend') ? 1 : undefined}
            waitingFor={assigned ? undefined : t('rounds.waiting.assignment')}
            tilt={4}
            onOpen={() => {}}
          />
        </div>
        <div data-tour={resultsOpen ? 'envResults' : 'envVote'}>
          <Envelope
            icon={<Icon name={resultsOpen ? 'winner' : 'ballot'} />}
            name={t(resultsOpen ? 'rounds.drawers.results' : 'rounds.drawers.vote')}
            waitingFor={phase === 'VOTING' || resultsOpen ? undefined : t('rounds.waiting.vote')}
            tilt={1}
            onOpen={() => {}}
          />
        </div>
        <Envelope
          icon={<Icon name="allergies" />}
          name={t('rounds.drawers.allergies')}
          meta={t('dietary.panelTitle')}
          tilt={2}
          onOpen={() => {}}
        />
      </div>
    </div>
  )
}

function Recipe({ which }: { which: 'written' | 'received' }) {
  const { t } = useTranslation()
  const ingredients = t(`tutorial.${which}.ingredients`, { returnObjects: true }) as string[]
  return (
    <div className="card stack">
      <h2>{t('briefs.ingredients')}</h2>
      <ul>
        {ingredients.map((ing) => (
          <li key={ing}>{ing}</li>
        ))}
      </ul>
      <h2>{t('briefs.procedure')}</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{t(`tutorial.${which}.procedure`)}</p>
    </div>
  )
}

export function BriefScreen() {
  const { t } = useTranslation()
  return (
    <div className="stack sheet">
      <Back />
      <h1>{t('tutorial.written.dish')}</h1>
      <p className="notice">{t('tutorial.writingFor', { name: chef('marco').secret })}</p>
      <span className="badge">{t('briefs.courseOption.MAIN')}</span>
      <Recipe which="written" />
      <button type="button" data-tour="sendBrief">
        {t('briefs.sendFinal')}
      </button>
    </div>
  )
}

export function RecipeScreen() {
  const { t } = useTranslation()
  return (
    <div className="stack sheet">
      <Back />
      <h1>{t('tutorial.received.dish')}</h1>
      <span className="badge">{t('briefs.courseOption.DESSERT')}</span>
      <p className="muted" style={{ margin: 0 }}>{t('tutorial.filRouge')}</p>
      <Recipe which="received" />
      <div className="card">
        <h2>{t('briefs.noteToCook')}</h2>
        <p style={{ margin: 0 }}>{t('tutorial.received.note')}</p>
      </div>
    </div>
  )
}

export function MessagesScreen({ sent, reached }: ScreenProps) {
  const { t } = useTranslation()
  const choices = MESSAGE_CHOICES.map((k) => t(`tutorial.messages.choices.${k}`))
  const said = reached('messagesReply') ? (sent ?? 0) : null
  const cook = chef('marco').secret

  const lines: { who: string; what: string; mine: boolean }[] = [
    { who: cook, what: t('tutorial.messages.first'), mine: false },
    ...(said !== null
      ? [
          { who: t('chat.you'), what: choices[said], mine: true },
          { who: cook, what: t('tutorial.messages.reply'), mine: false },
        ]
      : []),
  ]

  return (
    <div className="stack sheet">
      <Back />
      <h1>{t('rounds.drawers.messages')}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('tutorial.messages.withCook', { name: cook })}</p>
      <div className="menucard menucard--thread">
        <p className="menucard__head">{t('chat.title')}</p>
        <ol className="menucard__list">
          {lines.map((m, i) => (
            <li key={i} className="menucard__row">
              <div className={`menucard__course thread-line${m.mine ? ' is-mine' : ''}`}>
                <span className="menucard__name">
                  <span className="thread-line__who">{m.who}</span>
                  <span className="thread-line__said">{m.what}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {said === null && (
        <div className="stack" data-tour="sendMessage">
          <label>{t('chat.message')}</label>
          {choices.map((c, i) => (
            <button key={c} type="button" className="secondary" data-choice={i}>
              {c}
            </button>
          ))}
        </div>
      )}
      <p className="muted" style={{ margin: 0 }}>{t('tutorial.messages.localOnly')}</p>
    </div>
  )
}

export function BallotScreen() {
  const { t } = useTranslation()
  const dishes = CHAIN.filter((l) => l.cook !== 'you')
  const ordered = [...dishes].sort((x, y) => POINTS[y.dish] - POINTS[x.dish])
  return (
    <div className="stack sheet">
      <Back />
      <h1>{t('vote.title')}</h1>
      <p className="muted">{t('vote.instructionsTheme')}</p>
      <div className="stack">
        {ordered.map((l, i) => (
          <div key={l.dish} className="card ballotrow">
            <div className="ballotrow__head">
              <span className="ballotrow__grip" aria-hidden="true">
                ⠿
              </span>
              <strong className="ballotrow__rank">#{i + 1}</strong>
              <div className="ballotrow__dish">
                <div className="ballotrow__name">{t(`tutorial.dishes.${l.dish}`)}</div>
                <div className="muted">{t(`briefs.courseOption.${l.course}`)}</div>
                <div className="muted">{t('tutorial.filRouge')}</div>
              </div>
            </div>
            <div className="themeslider">
              <label className="themeslider__label">
                {t('vote.themeScore')}
                <input
                  type="range"
                  min={1}
                  max={5}
                  readOnly
                  className={i === 0 ? 'themeslider__input' : 'themeslider__input is-unset'}
                  value={i === 0 ? 5 : 3}
                />
              </label>
              <div className="themeslider__ends" aria-hidden="true">
                <span>{t('vote.themeScoreLow')}</span>
                <span>{t('vote.themeScoreHigh')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" data-tour="sendBallot">
        {t('vote.submitBallot')}
      </button>
    </div>
  )
}

function useTourChain() {
  const { t } = useTranslation()
  const realName = (key: ChefKey) => (key === 'you' ? t('tutorial.you') : chef(key).name)
  return CHAIN.map((l, i) => ({
    sender_member_id: l.sender,
    sender_secret_name: chef(l.sender).secret,
    sender_display_name: realName(l.sender),
    cook_member_id: l.cook,
    cook_secret_name: chef(l.cook).secret,
    cook_display_name: realName(l.cook),
    slot_id: String(i),
    course: l.course,
    lap: 1,
  }))
}

export function ResultsScreen({ reached }: ScreenProps) {
  const { t } = useTranslation()
  const cycle = useTourChain()
  const revealed = reached('resultsKeep')
  const kept = reached('resultsPhoto')
  const photo = reached('profileKept')

  return (
    <div className="stack sheet">
      <Back />
      <h1>{t('rounds.drawers.results')}</h1>
      {/* The real carte: dishes, points and the winner — never names. Who
          cooked what is the chain's to tell, below. */}
      <div className="menucard">
        <p className="menucard__head">{t('tutorial.dinnerName')}</p>
        <ol className="menucard__list">
          {[...CHAIN]
            .sort((x, y) => POINTS[y.dish] - POINTS[x.dish])
            .map((l) => (
              <li key={l.dish} className="menucard__row">
                <div className="menucard__course">
                  <span className="menucard__name">
                    {l.dish === WINNER && '🏆 '}
                    {t(`tutorial.dishes.${l.dish}`)}
                  </span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {t('tutorial.points', { count: POINTS[l.dish] })}
                  </span>
                </div>
              </li>
            ))}
        </ol>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>{t('results.chainTitle')}</h2>
        {revealed ? (
          <ChainCircle cycle={cycle} youId="you" realNames />
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>{t('chain.spoilerWarning')}</p>
            <button type="button" data-tour="reveal">
              {t('chain.reveal')}
            </button>
          </>
        )}
      </div>

      {revealed && (
        <div className="stack">
          <button type="button" className={kept ? 'secondary' : undefined} data-tour="keepRecipe">
            {t('book.keepRecipes')}
          </button>
          {kept && <p className="notice">{t('book.savedTo', { n: 1 })}</p>}
        </div>
      )}

      {kept && (
        <div className="stack">
          <h2 style={{ margin: 0 }}>{t('album.title')}</h2>
          {photo ? (
            <img className="album__photo" src="/fil-rouge/maize.avif" alt="" />
          ) : (
            <>
              <div className="album__pending" aria-hidden="true" />
              <button type="button" data-tour="addPhoto">
                {t('album.add')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The profile, reduced to the two things the evening left behind. */
export function ProfileScreen() {
  const { t } = useTranslation()
  return (
    <div className="stack sheet">
      <h1>{t('profile.title')}</h1>
      <details className="fold" open>
        <summary className="fold__summary">
          <span className="fold__tri" aria-hidden="true">
            ▸
          </span>
          <span className="fold__title">{t('book.title')}</span>
          <span className="fold__aside">1</span>
        </summary>
        <ol className="menucard__list recipepreview">
          <li className="menucard__row">
            <div className="menucard__course recipepreview__row">
              <span className="menucard__name">
                <strong>{t('tutorial.dishes.tacos')}</strong>
                <span className="muted recipepreview__from">
                  {t('tutorial.dinnerName')} · {t('book.relation.WROTE')}
                </span>
              </span>
            </div>
          </li>
        </ol>
      </details>
      <details className="fold" open>
        <summary className="fold__summary">
          <span className="fold__tri" aria-hidden="true">
            ▸
          </span>
          <span className="fold__title">{t('album.profileTitle')}</span>
          <span className="fold__aside">1</span>
        </summary>
        <div className="albumstrip">
          <img className="albumprint" src="/fil-rouge/maize.avif" alt="" />
        </div>
      </details>
      <button type="button" data-tour="finish">
        {t('tutorial.finish')}
      </button>
    </div>
  )
}

export function EndScreen({ onCreate, onHome }: { onCreate: () => void; onHome: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="stack sheet tour__end">
      <img src="/logos/hat-red-on-white.png" alt="" width={96} height={96} className="tour__end-face" />
      <h1>{t('tutorial.endTitle')}</h1>
      <p>{t('tutorial.endBody')}</p>
      <div className="row">
        <button type="button" onClick={onCreate}>
          {t('tutorial.createFirst')}
        </button>
        <button type="button" className="secondary" onClick={onHome}>
          {t('tutorial.home')}
        </button>
      </div>
    </div>
  )
}
