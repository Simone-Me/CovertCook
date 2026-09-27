import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { markTutorialSeen } from '../../lib/tutorialSeen'
import { Coach } from './Coach'
import { STEPS, indexOf } from './script'
import {
  BallotScreen,
  BriefScreen,
  CreateScreen,
  EndScreen,
  MessagesScreen,
  RecipeScreen,
  ResultsScreen,
  TableScreen,
  type ScreenProps,
} from './screens'

/**
 * A WHOLE DINNER IN TWO MINUTES, WITH NOBODY ELSE AT THE TABLE.
 *
 * Nothing here touches the server: the dinner is a step number, and every
 * screen is drawn from how far it has got. That is also why it can be left at
 * any moment and started again from the top — there is nothing to clean up.
 *
 * ONE THING CAN BE PRESSED. Clicks are caught on their way down and anything
 * that is not the step's target is swallowed, with the chef nudging instead.
 * Catching them here rather than disabling every control keeps the screens
 * looking exactly like the real ones — a table of greyed-out buttons would
 * teach people the app is greyed out.
 */
export function TutorialPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [at, setAt] = useState(0)
  const [sent, setSent] = useState<number | null>(null)
  const [nudge, setNudge] = useState(false)
  const nudgeTimer = useRef<number | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)
  const lastScreen = useRef<string | null>(null)

  const step = STEPS[at]
  const last = at === STEPS.length - 1

  useEffect(() => {
    markTutorialSeen()
    return () => window.clearTimeout(nudgeTimer.current)
  }, [])

  // The step's target is marked and brought into the space above the chef.
  // A new screen starts at its top, the way a real page would open.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (lastScreen.current !== step.screen) window.scrollTo(0, 0)
    lastScreen.current = step.screen
    el.querySelectorAll('.tour-target').forEach((n) => n.classList.remove('tour-target'))
    const target = step.target ? el.querySelector(`[data-tour="${step.target}"]`) : null
    if (target) {
      target.classList.add('tour-target')
      target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    }
  }, [step])

  function next() {
    setAt((n) => Math.min(n + 1, STEPS.length - 1))
  }

  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement
    if (last || el.closest('.coach')) return
    const hit = step.target ? el.closest(`[data-tour="${step.target}"]`) : null
    const choice = step.target === 'sendMessage' ? el.closest('[data-choice]') : null
    if (hit && (step.target !== 'sendMessage' || choice)) {
      // The story is the only thing that moves the screen. Left alone, the
      // browser would toggle the pass after React had already opened it for
      // the next step — and close it again.
      e.preventDefault()
      if (choice) setSent(Number(choice.getAttribute('data-choice')))
      next()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    window.clearTimeout(nudgeTimer.current)
    setNudge(true)
    nudgeTimer.current = window.setTimeout(() => setNudge(false), 500)
  }

  const props: ScreenProps = {
    phase: step.phase,
    reached: (id) => at >= indexOf(id),
    sent,
    revealed: at > indexOf('resultsReveal'),
  }

  return (
    <div className={last ? 'tour' : 'tour tour--coached'} ref={root} onClickCapture={onClickCapture}>
      <div className="tour__stage">
        {step.screen === 'create' && <CreateScreen {...props} />}
        {step.screen === 'table' && <TableScreen {...props} />}
        {step.screen === 'brief' && <BriefScreen />}
        {step.screen === 'recipe' && <RecipeScreen />}
        {step.screen === 'messages' && <MessagesScreen {...props} />}
        {step.screen === 'ballot' && <BallotScreen />}
        {step.screen === 'results' && <ResultsScreen {...props} />}
        {step.screen === 'end' && (
          <EndScreen onCreate={() => navigate('/rounds/new')} onHome={() => navigate('/')} />
        )}
      </div>

      {!last && (
        <Coach
          say={t(`tutorial.say.${step.id}`)}
          step={at + 1}
          total={STEPS.length - 1}
          canOk={!step.target}
          canSkip={!!step.target}
          nudge={nudge}
          onOk={next}
          onSkip={next}
          onExit={() => navigate('/')}
        />
      )}
    </div>
  )
}
