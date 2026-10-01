import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Fold } from '../../components/Fold'
import {
  countdownHidden,
  getTextStep,
  setCountdownHidden,
  setTextStep,
  sizeName,
  TEXT_STEPS,
  type TextSizeName,
} from '../../lib/prefs'

const WORDS: TextSizeName[] = ['small', 'medium', 'large']

/** How this device shows things: the text size and the dinner countdown. */
export function DisplayPrefs() {
  const { t } = useTranslation()
  const [step, setStep] = useState(getTextStep)
  const [hidden, setHidden] = useState(countdownHidden)
  const current = sizeName(step)

  return (
    <Fold title={t('display.title')} aside={t(`display.size.${current}`)}>
      <div className="stack card">
        <label htmlFor="text-size">{t('display.textSize')}</label>

        {/* The three words sit above the bar; the one the knob is nearest to
            is lit, so the words themselves say where you are. */}
        <div className="sizescale__words" aria-hidden="true">
          {WORDS.map((w) => (
            <span key={w} className={w === current ? 'is-on' : undefined}>
              {t(`display.size.${w}`)}
            </span>
          ))}
        </div>

        <input
          id="text-size"
          type="range"
          className="sizescale__bar"
          min={0}
          max={TEXT_STEPS - 1}
          step={1}
          value={step}
          onChange={(e) => {
            const next = Number(e.target.value)
            setStep(next)
            setTextStep(next)
          }}
          aria-valuetext={t(`display.size.${current}`)}
        />

        {/* The notches, drawn: nine stops, so a stop is something you can see
            and not a guess about how far a knob has travelled. */}
        <div className="sizescale__ticks" aria-hidden="true">
          {Array.from({ length: TEXT_STEPS }, (_, i) => (
            <span key={i} className={i === step ? 'is-on' : undefined} />
          ))}
        </div>

        <label className="row">
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={!hidden}
            onChange={(e) => {
              setHidden(!e.target.checked)
              setCountdownHidden(!e.target.checked)
            }}
          />
          <span>{t('display.countdown')}</span>
        </label>
      </div>
    </Fold>
  )
}
