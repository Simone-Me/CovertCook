import { useTranslation } from 'react-i18next'
import type { DietaryKind, DietaryPanelEntry } from '../../lib/rpc'

// Simple geometric glyphs, distinguished by shape (not just color, for
// colorblind-safe legibility) so each dietary_kind reads differently at a
// glance: severe allergy = filled warning triangle, mild = outlined
// warning triangle, diet = checkmark, dislike = minus. Functional
// placeholders, not final branding — swap for real allergen icons later.
function KindIcon({ kind }: { kind: DietaryKind }) {
  switch (kind) {
    case 'ALLERGY_SEVERE':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M12 3 22 20H2z" fill="var(--danger)" />
          <text x="12" y="18" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--bg)">
            !
          </text>
        </svg>
      )
    case 'ALLERGY_MILD':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M12 3 22 20H2z" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
          <text x="12" y="18" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--accent)">
            !
          </text>
        </svg>
      )
    case 'DIET':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28">
          <circle cx="12" cy="12" r="9" fill="none" stroke="var(--text)" strokeWidth="2" />
          <path d="M7 12l3.5 3.5L17 8.5" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'DISLIKE':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28">
          <circle cx="12" cy="12" r="9" fill="none" stroke="var(--text-muted)" strokeWidth="2" />
          <line x1="7" y1="12" x2="17" y2="12" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
  }
}

// Shared by the round page and the brief editor (where a Sender cross-
// references it while filling in contains_tags) — one placeholder-icon
// grid, one place to swap in real allergen icons later.
export function DietaryPanelGrid({ entries }: { entries: DietaryPanelEntry[] | undefined }) {
  const { t } = useTranslation()

  if (entries && entries.length === 0) {
    return <p className="muted">{t('dietary.panelEmpty')}</p>
  }

  return (
    <div className="allergy-grid">
      {entries?.map((d, i) => (
        <div key={i} className="allergy-card">
          <div className="allergy-placeholder" aria-label={t('dietary.gridAlt')}>
            <KindIcon kind={d.kind} />
          </div>
          <span className="muted">{t(`dietary.kind.${d.kind}`)}</span>
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  )
}
