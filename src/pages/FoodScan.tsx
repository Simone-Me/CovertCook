// Scan a plate: take or pick a photo -> ingredients as removable chips (+ top-3 dishes in part D).
// Source of truth: food-recognition/web/src/pages/FoodScan.tsx. Inference runs entirely on the phone.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { WipChip } from '../components/WipChip'
import { predictFile, type Ingredient, type Prediction } from '../lib/foodModel'
import './FoodScan.css'

const MODEL_URL = '/models/a_convnext__model_int8_minmax_200_pc_only-conv_rr.onnx' // the variant chosen in step A13
const META_URL = '/models/a_convnext__meta.json'

// Where the analysis is. 'download' only happens on first use (afterwards the model is cached).
type Stage = { kind: 'idle' } | { kind: 'download'; fraction: number | null } | { kind: 'analyse' } | { kind: 'error'; message: string }

export default function FoodScan() {
  const { t } = useTranslation()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [pred, setPred] = useState<Prediction | null>(null)
  const [chips, setChips] = useState<Ingredient[]>([])
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const busy = stage.kind === 'download' || stage.kind === 'analyse'

  // The preview is an object URL: release it when replaced or when leaving the page.
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  async function onFile(file: File | undefined) {
    if (!file || busy) return
    setPhotoUrl(URL.createObjectURL(file))
    setPred(null)
    setChips([])
    setStage({ kind: 'analyse' })
    try {
      const p = await predictFile(file, MODEL_URL, META_URL, (fraction) =>
        setStage(fraction !== null && fraction >= 1 ? { kind: 'analyse' } : { kind: 'download', fraction }))
      setPred(p)
      setChips(p.ingredients)
      setStage({ kind: 'idle' })
    } catch (e) {
      console.error(e)
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="stack sheet scan">
      <Link to="/profile" className="scan__back">← {t('scan.toProfile')}</Link>
      <h1>
        {t('scan.title')} <WipChip />
      </h1>
      <p className="muted">{t('scan.lead')}</p>

      <div className="scan__actions">
        {/* Two inputs, not one: `capture` opens the camera directly, without it the phone offers the gallery. */}
        <label className={`scan__pick${busy ? ' is-disabled' : ''}`}>
          {t('scan.takePhoto')}
          <input type="file" accept="image/*" capture="environment" disabled={busy}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <label className={`scan__pick${busy ? ' is-disabled' : ''}`}>
          {t('scan.gallery')}
          <input type="file" accept="image/*" disabled={busy}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>

      {photoUrl && <img className="scan__photo" src={photoUrl} alt={t('scan.photoAlt')} />}

      {busy && (
        <div className="scan__progress" role="status" aria-live="polite">
          {stage.kind === 'download' && stage.fraction !== null
            ? <progress max={1} value={stage.fraction} />
            : <progress />}
          <span className="muted">
            {stage.kind === 'download'
              ? t('scan.downloading', { pct: stage.fraction === null ? '…' : Math.round(stage.fraction * 100) })
              : t('scan.analysing')}
          </span>
        </div>
      )}

      {stage.kind === 'error' && <div className="error">{t('scan.error')} <small>({stage.message})</small></div>}

      {pred?.unknown && <p className="card">{t('scan.unknown')}</p>}
      {pred && pred.dishes.length > 0 && (
        <ol>{pred.dishes.map((d) => <li key={d.name}>{d.name}</li>)}</ol>
      )}
      {chips.length > 0 && (
        <>
          <p className="muted">{t('scan.removeHint')}</p>
          <div className="scan__chips">
            {chips.map((c) => (
              // Human in the loop: the user removes what is wrong (and later adds what is missing).
              <button key={c.id} type="button" className="secondary"
                onClick={() => setChips(chips.filter((x) => x.id !== c.id))}>
                {c.name} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
        </>
      )}
      {pred && (
        <small className="muted">
          {t('scan.timings', { pre: pred.timings.preMs.toFixed(0), run: pred.timings.runMs.toFixed(0) })}
        </small>
      )}
    </div>
  )
}
