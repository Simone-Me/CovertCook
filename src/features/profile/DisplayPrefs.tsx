import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Fold } from '../../components/Fold'
import { ChoiceList } from '../../components/ChoiceList'
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
        <ChoiceList
          name="text-size"
          value={size}
          onChange={(v: string) => {
            setSize(v as TextSize)
            setTextSize(v as TextSize)
          }}
          options={SIZES.map((s) => ({ value: s, label: t(`display.size.${s}`) }))}
        />
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
