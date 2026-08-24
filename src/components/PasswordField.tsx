import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * A password input that can be read back, has to be typed twice, and says the
 * rules before you break them rather than after.
 *
 * **The eye.** Hiding what somebody is typing on their own phone protects
 * against a shoulder that is usually not there, at the cost of every typo
 * being invisible — which is what makes people choose shorter passwords. The
 * field starts masked and can be revealed; that is the trade the whole industry
 * eventually made.
 *
 * **Copy is blocked, and paste is blocked only on the confirmation.** Copying a
 * password out of a form is how it ends up in a clipboard history that syncs to
 * three other devices. Pasting into the *confirmation* would defeat what the
 * confirmation is for: catching a typo in the first one. Pasting into the first
 * field stays allowed on purpose — that is how a password manager offers a
 * strong generated password, and blocking it would push people towards
 * something they can type twice from memory, which is exactly the wrong
 * outcome. Managers that autofill do not raise a paste event at all, so they
 * keep working either way.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  allowPaste = true,
  autoComplete = 'new-password',
  describedBy,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  allowPaste?: boolean
  autoComplete?: string
  describedBy?: string
}) {
  const { t } = useTranslation()
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label htmlFor={fieldId}>{label}</label>
      <div className="row password-row">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          required
          value={value}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onPaste={allowPaste ? undefined : (e) => e.preventDefault()}
        />
        <button
          type="button"
          className="secondary password-reveal"
          aria-pressed={visible}
          aria-label={t(visible ? 'auth.password.hide' : 'auth.password.show')}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  )
}
