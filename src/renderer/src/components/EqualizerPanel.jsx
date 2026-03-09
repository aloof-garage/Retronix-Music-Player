import { useState } from 'react'
import { HWButton, ToggleSwitch } from './UIComponents'
import { usePlayer } from '../store/PlayerStore'

const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const EQ_LABELS = ['31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K']

const PRESETS = [
  'flat', 'bass_boost', 'treble_boost', 'rock', 'pop',
  'jazz', 'classical', 'electronic', 'vocal', 'loudness'
]

const PRESET_LABELS = {
  flat: 'FLAT', bass_boost: 'BASS+', treble_boost: 'TREBLE+',
  rock: 'ROCK', pop: 'POP', jazz: 'JAZZ',
  classical: 'CLASSICAL', electronic: 'ELEC', vocal: 'VOCAL', loudness: 'LOUD'
}

export function EqualizerPanel({ theme: T, eqValues, onEqChange, enabled, onToggle }) {
  const { applyEqPreset } = usePlayer()
  const [activePreset, setActivePreset] = useState('flat')

  const handlePreset = (preset) => {
    const gains = applyEqPreset(preset)
    if (gains) {
      EQ_BANDS.forEach(freq => {
        onEqChange?.(freq, gains[freq] || 0)
      })
    }
    setActivePreset(preset)
  }

  const handleReset = () => handlePreset('flat')

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>
            EQUALIZER
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
            10-BAND PARAMETRIC EQ
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ToggleSwitch active={enabled} onChange={onToggle} theme={T} label="EQ ON"/>
          <HWButton size="sm" theme={T} onClick={handleReset}>RESET</HWButton>
        </div>
      </div>

      {/* EQ Display */}
      <div style={{
        borderRadius: 12, padding: '24px 20px',
        background: T.surfaceDeep, boxShadow: T.neumorphIn,
        border: `1px solid ${T.border}`, marginBottom: 20,
      }}>
        {/* dB scale */}
        <div style={{ display: 'flex', marginBottom: 8 }}>
          <div style={{ width: 30, fontSize: 8, color: T.textMuted, textAlign: 'right', paddingRight: 6 }}>
            +12<br/><br/>0<br/><br/>-12
          </div>
          <div style={{ flex: 1, display: 'flex', gap: 8, justifyContent: 'space-around', alignItems: 'stretch' }}>
            {EQ_BANDS.map((freq, i) => (
              <EQSlider
                key={freq}
                freq={freq}
                label={EQ_LABELS[i]}
                value={eqValues?.[freq] || 0}
                onChange={v => onEqChange?.(freq, v)}
                theme={T}
                enabled={enabled}
              />
            ))}
          </div>
        </div>

        {/* Center line */}
        <div style={{
          height: 1, background: T.border, margin: '0 30px',
          boxShadow: `0 0 4px ${T.accent}22`,
        }}/>
      </div>

      {/* Presets */}
      <div style={{ borderRadius: 12, padding: 16, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 12 }}>
          PRESETS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map(preset => (
            <HWButton
              key={preset}
              size="sm"
              theme={T}
              active={activePreset === preset && enabled}
              onClick={() => handlePreset(preset)}
            >
              {PRESET_LABELS[preset]}
            </HWButton>
          ))}
        </div>
      </div>

      {/* EQ Curve preview */}
      <div style={{ marginTop: 20, borderRadius: 12, padding: 16, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 8 }}>
          EQ CURVE
        </div>
        <EQCurve eqValues={eqValues} theme={T} enabled={enabled}/>
      </div>
    </div>
  )
}

// ── EQ Slider ─────────────────────────────────────────────────────────────────
function EQSlider({ freq, label, value, onChange, theme: T, enabled }) {
  const height = 160
  const pct = ((value + 12) / 24) * 100

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, width: 32,
    }}>
      {/* Value display */}
      <div style={{
        fontSize: 9, color: T.accent, letterSpacing: '0.05em',
        fontFamily: "'Courier New', monospace",
        minWidth: 28, textAlign: 'center',
      }}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}
      </div>

      {/* Slider track */}
      <div style={{
        position: 'relative', height, width: 24,
        display: 'flex', justifyContent: 'center',
      }}>
        {/* Track */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: 4, transform: 'translateX(-50%)',
          background: T.inputBg || T.surfaceDeep,
          boxShadow: T.neumorphIn,
          borderRadius: 2,
        }}/>

        {/* Fill */}
        <div style={{
          position: 'absolute', left: '50%', width: 4,
          transform: 'translateX(-50%)',
          background: enabled ? T.eqBar || T.accent : T.textMuted,
          borderRadius: 2,
          bottom: value >= 0 ? '50%' : `${50 - Math.abs(value) * (50/12)}%`,
          height: `${Math.abs(value) * (50/12)}%`,
          minHeight: value !== 0 ? 2 : 0,
          opacity: enabled ? 1 : 0.3,
          transition: 'opacity 0.2s',
        }}/>

        {/* Center line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          height: 1, background: T.border,
        }}/>

        {/* Thumb */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          bottom: `${pct}%`, marginBottom: -6,
          width: 16, height: 12, borderRadius: 3,
          background: enabled ? T.accent : T.textMuted,
          boxShadow: enabled
            ? `0 0 8px ${T.accent}66, 2px 2px 4px rgba(0,0,0,0.4)`
            : '2px 2px 4px rgba(0,0,0,0.4)',
          cursor: 'pointer', zIndex: 1,
          transition: 'opacity 0.2s',
          opacity: enabled ? 1 : 0.5,
        }}/>

        {/* Hidden range input */}
        <input
          type="range"
          min={-12}
          max={12}
          step={0.5}
          value={value}
          onChange={e => onChange?.(parseFloat(e.target.value))}
          disabled={!enabled}
          style={{
            position: 'absolute', inset: 0, opacity: 0,
            cursor: 'pointer', writingMode: 'vertical-lr',
            direction: 'rtl', width: '100%', height: '100%',
          }}
        />
      </div>

      {/* Label */}
      <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

// ── EQ Curve visualization ─────────────────────────────────────────────────────
function EQCurve({ eqValues, theme: T, enabled }) {
  const W = 400, H = 80

  if (!eqValues) return null

  const points = EQ_BANDS.map((freq, i) => {
    const v = eqValues[freq] || 0
    const x = (i / (EQ_BANDS.length - 1)) * W
    const y = H / 2 - (v / 12) * (H / 2 - 8)
    return `${x},${y}`
  })

  const path = `M ${points.join(' L ')}`

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', opacity: enabled ? 1 : 0.3 }}>
      {/* Grid */}
      <line x1="0" y1={H/2} x2={W} y2={H/2} stroke={`${T.border}`} strokeWidth="1"/>
      {/* Curve */}
      <path d={path} fill="none" stroke={T.accent} strokeWidth="2"/>
      {/* Area fill */}
      <path d={`${path} L ${W},${H/2} L 0,${H/2} Z`}
        fill={`${T.accent}22`}/>
      {/* Points */}
      {points.map((p, i) => {
        const [x, y] = p.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={3} fill={T.accent}/>
      })}
    </svg>
  )
}
