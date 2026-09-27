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
import { CHAIN, CHEFS, MESSAGE_CHOICES, WINNER, chef, type ChefKey } from './fixture'

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
  revealed: boolean
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
  const friendsIn = reached('tableClose')
  const passOpen = reached('tableInvite')
  const assigned = reached('tableAssigned')
  const seats = friendsIn ? CHEFS.length : 1

  const next: Partial<Record<RoundStatus, RoundStatus>> = {
    OPEN: 'LOCKED',
    BRIEFS_CLOSED: 'DINNER',
    DINNER: 'VOTING',
    VOTING: 'RESULTS',
  }
  const nextPhase = friendsIn || phase !== 'OPEN' ? next[phase] : undefined
  const resultsOpen = phase === 'RESULTS'

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
                  <input id="tour-invite" readOnly placeholder={t('rounds.invitations.inviteUsername')} />
                  <button type="button" className="secondary">{t('actions.add')}</button>
                </div>
                {friendsIn && <p className="muted" style={{ margin: 0 }}>{t('tutorial.friendsIn')}</p>}
              </div>
            )}

            {phase === 'LOCKED' && (
              <div className="stack">
                <span className="pass__section-title">{t('rounds.assignment.title')}</span>
                <p className="muted" style={{ margin: 0 }}>{t('rounds.assignment.explain')}</p>
                <button type="button" data-tour="roulette">{t('rounds.assignment.generate')}</button>
              </div>
            )}

            {(phase === 'ASSIGNED' || phase === 'BRIEFS_CLOSED') && (
              <p className="muted" style={{ margin: 0 }}>{t(`rounds.pass.phase.${phase}`)}</p>
            )}

            {phase === 'VOTING' && (
              <p className="muted" style={{ margin: 0 }}>
                {t('vote.progress', { voted: reached('tableResults') ? CHEFS.length : 0, eligible: CHEFS.length })}
              </p>
            )}

            {phase === 'RESULTS' && <p className="muted" style={{ margin: 0 }}>{t('vote.published')}</p>}

            {nextPhase && (
              <div className="stack pass__advance">
                <hr className="pass__rule" />
                <button type="button" data-tour="advance">
                  {t('actions.next')} → {t(`rounds.phase.${nextPhase}`)}
                </button>
              </div>
            )}
          </HostPass>
        </div>

        <Envelope
          icon={<Icon name="chefs" />}
          name={t('rounds.drawers.chefs')}
          meta={`${t('rounds.chefCount', { count: seats })} — ${t('rounds.executiveChef')} : ${t('tutorial.you')}`}
          tilt={1}
          onOpen={() => {}}
        />
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
  return (
    <div className="stack sheet">
      <Back />
      <h1>{t('vote.title')}</h1>
      <p className="muted">{t('tutorial.ballotHint')}</p>
      <div className="stack">
        {[WINNER, ...dishes.map((d) => d.dish).filter((d) => d !== WINNER)].map((dish, i) => (
          <div key={dish} className="card ballotrow">
            <div className="ballotrow__head">
              <span className="ballotrow__rank">{i + 1}</span>
              <span className="ballotrow__name">{t(`tutorial.dishes.${dish}`)}</span>
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

export function ResultsScreen({ revealed }: ScreenProps) {
  const { t } = useTranslation()
  const realName = (key: ChefKey) => (key === 'you' ? t('tutorial.you') : chef(key).name)
  const cycle = CHAIN.map((l, i) => ({
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

  return (
    <div className="stack sheet">
      <Back />
      <h1>{t('rounds.drawers.results')}</h1>
      <div className="menucard">
        <p className="menucard__head">{t('vote.theMenu')}</p>
        <ol className="menucard__list">
          {[...CHAIN]
            .sort((a, b) => (a.dish === WINNER ? -1 : b.dish === WINNER ? 1 : 0))
            .map((l) => (
              <li key={l.dish} className="menucard__row">
                <div className="menucard__course">
                  <span className="menucard__name">
                    {l.dish === WINNER && '🏆 '}
                    {t(`tutorial.dishes.${l.dish}`)}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {revealed
                      ? t('tutorial.cookedBy', {
                          cook: realName(l.cook),
                          sender: realName(l.sender),
                        })
                      : chef(l.cook).secret}
                  </span>
                </div>
              </li>
            ))}
        </ol>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>{t('chain.title')}</h2>
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
    </div>
  )
}

export function EndScreen({ onCreate, onHome }: { onCreate: () => void; onHome: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="stack sheet tour__end">
      <img src="/logo_face.webp" alt="" width={96} height={96} className="tour__end-face" />
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
