import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Fold } from '../../components/Fold'
import {
  countdownHidden,
  getTextSize,
  setCountdownHidden,
  setTextSize,
  type TextSize,
} from '../../lib/prefs'

const SIZES: TextSize[] = ['small', 'medium', 'large']

/** How this device shows things: the text size and the dinner countdown. */
export function DisplayPrefs() {
  const { t } = useTranslation()
  const [size, setSize] = useState<TextSize>(getTextSize)
  const [hidden, setHidden] = useState(countdownHidden)

  return (
    <Fold title={t('display.title')} aside={t(`display.size.${size}`)}>
      <div className="stack card">
        {/* A slider with three stops: the choice is a scale, not three
            unrelated options. */}
        <div className="stack">
          <label htmlFor="text-size">{t(`display.size.${size}`)}</label>
          <input
            id="text-size"
            type="range"
            min={0}
            max={SIZES.length - 1}
            step={1}
            value={SIZES.indexOf(size)}
            onChange={(e) => {
              const next = SIZES[Number(e.target.value)]
              setSize(next)
              setTextSize(next)
            }}
            aria-valuetext={t(`display.size.${size}`)}
          />
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
