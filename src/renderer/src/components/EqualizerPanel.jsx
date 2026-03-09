import { useState, useRef, useEffect, useCallback } from 'react'
import { HWButton, ToggleSwitch } from './UIComponents'
import { usePlayer } from '../store/PlayerStore'

const EQ_BANDS  = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const EQ_LABELS = ['31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K']

const PRESETS = [
  'flat','bass_boost','treble_boost','rock','pop','jazz','classical','electronic','vocal','loudness'
]
const PRESET_LABELS = {
  flat:'FLAT', bass_boost:'BASS+', treble_boost:'TREBLE+', rock:'ROCK', pop:'POP',
  jazz:'JAZZ', classical:'CLASS', electronic:'ELEC', vocal:'VOCAL', loudness:'LOUD'
}

export function EqualizerPanel({ theme: T, eqValues, onEqChange, enabled, onToggle }) {
  const { applyEqPreset } = usePlayer()
  const [activePreset, setActivePreset] = useState('flat')

  const handlePreset = (preset) => {
    const gains = applyEqPreset(preset)
    if (gains) EQ_BANDS.forEach(freq => onEqChange?.(freq, gains[freq] || 0))
    setActivePreset(preset)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>EQUALIZER</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>10-BAND PARAMETRIC EQ</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ToggleSwitch active={enabled} onChange={onToggle} theme={T} label="EQ ON"/>
          <HWButton size="sm" theme={T} onClick={() => handlePreset('flat')}>RESET</HWButton>
        </div>
      </div>

      {/* Sliders */}
      <div style={{
        borderRadius: 12, padding: '20px 16px',
        background: T.surfaceDeep, boxShadow: T.neumorphIn,
        border: `1px solid ${T.border}`, marginBottom: 20,
      }}>
        {/* dB scale labels */}
        <div style={{ display: 'flex', marginBottom: 4, paddingLeft: 28 }}>
          {['+12', '+6', '0', '-6', '-12'].map((l, i) => (
            <div key={i} style={{ display: 'none' }}/>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          {/* dB axis */}
          <div style={{
            width: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            height: 180, paddingTop: 0, paddingBottom: 0,
            fontSize: 8, color: T.textMuted, textAlign: 'right', paddingRight: 6, flexShrink: 0,
          }}>
            <span>+12</span><span>+6</span><span>0</span><span>-6</span><span>-12</span>
          </div>
          {/* Band sliders */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>
            {EQ_BANDS.map((freq, i) => (
              <EQSlider
                key={freq}
                freq={freq}
                label={EQ_LABELS[i]}
                value={eqValues?.[freq] ?? 0}
                onChange={v => onEqChange?.(freq, v)}
                theme={T}
                enabled={enabled}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Presets */}
      <div style={{
        borderRadius: 12, padding: 16,
        background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}`,
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 12 }}>PRESETS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map(preset => (
            <HWButton key={preset} size="sm" theme={T}
              active={activePreset === preset && enabled}
              onClick={() => handlePreset(preset)}>
              {PRESET_LABELS[preset]}
            </HWButton>
          ))}
        </div>
      </div>

      {/* Curve */}
      <div style={{ borderRadius: 12, padding: 16, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 8 }}>EQ CURVE</div>
        <EQCurve eqValues={eqValues} theme={T} enabled={enabled}/>
      </div>
    </div>
  )
}

// ── EQ Slider — drag-based vertical fader ─────────────────────────────────────
// Uses mouse/pointer drag instead of CSS writing-mode (unreliable in Electron).
function EQSlider({ freq, label, value, onChange, theme: T, enabled }) {
  const TRACK_H  = 160   // px height of the draggable track
  const MIN = -12, MAX = 12

  const trackRef  = useRef(null)
  const dragging  = useRef(false)
  const startY    = useRef(0)
  const startVal  = useRef(0)

  // Convert value → thumb top position (0 = top = +12, TRACK_H = bottom = -12)
  const valToY = (v) => ((MAX - v) / (MAX - MIN)) * TRACK_H
  const yToVal = (y) => {
    const clamped = Math.max(0, Math.min(TRACK_H, y))
    const raw = MAX - (clamped / TRACK_H) * (MAX - MIN)
    // Snap to 0.5 steps
    return Math.round(raw * 2) / 2
  }

  const thumbY = valToY(value ?? 0)

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    dragging.current  = true
    startY.current    = e.clientY
    startVal.current  = value ?? 0
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [enabled, value])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return
    const dy     = e.clientY - startY.current
    const newVal = yToVal(valToY(startVal.current) + dy)
    if (newVal !== (value ?? 0)) onChange?.(newVal)
  }, [value, onChange])

  const onPointerUp = useCallback((e) => {
    dragging.current = false
  }, [])

  // Also allow clicking anywhere on the track to jump to that position
  const onTrackClick = useCallback((e) => {
    if (!enabled) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const y = e.clientY - rect.top
    onChange?.(yToVal(y))
  }, [enabled, onChange])

  const displayVal = (value ?? 0)
  const fillHeight = Math.abs(displayVal) / MAX * (TRACK_H / 2)
  const fillTop    = displayVal >= 0 ? TRACK_H / 2 - fillHeight : TRACK_H / 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 32 }}>
      {/* Value readout */}
      <div style={{
        fontSize: 9, color: T.accent, fontFamily: "'Courier New', monospace",
        minWidth: 30, textAlign: 'center', letterSpacing: '0.04em',
        opacity: enabled ? 1 : 0.4,
      }}>
        {displayVal > 0 ? '+' : ''}{displayVal.toFixed(1)}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onClick={onTrackClick}
        style={{
          position: 'relative', width: 10, height: TRACK_H,
          cursor: enabled ? 'pointer' : 'default',
        }}
      >
        {/* Background rail */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 4,
          transform: 'translateX(-50%)',
          background: T.inputBg || T.surfaceDeep,
          borderRadius: 2, boxShadow: T.neumorphIn,
        }}/>

        {/* Zero line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          height: 1, background: T.border, pointerEvents: 'none',
        }}/>

        {/* Fill bar */}
        {displayVal !== 0 && (
          <div style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            width: 4, borderRadius: 2,
            top: fillTop, height: fillHeight,
            background: enabled ? (T.eqBar || T.accent) : T.textMuted,
            opacity: enabled ? 1 : 0.3,
            pointerEvents: 'none',
          }}/>
        )}

        {/* Thumb — this is what you drag */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            top: thumbY - 7,               // center the 14px thumb on thumbY
            width: 20, height: 14,
            borderRadius: 4,
            background: enabled ? T.accent : T.textMuted,
            boxShadow: enabled
              ? `0 0 8px ${T.accent}88, 2px 2px 4px rgba(0,0,0,0.5)`
              : '1px 1px 3px rgba(0,0,0,0.4)',
            cursor: enabled ? 'ns-resize' : 'default',
            opacity: enabled ? 1 : 0.5,
            userSelect: 'none',
            touchAction: 'none',
            zIndex: 2,
          }}
        />
      </div>

      {/* Frequency label */}
      <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

// ── EQ Curve ──────────────────────────────────────────────────────────────────
function EQCurve({ eqValues, theme: T, enabled }) {
  const W = 400, H = 80
  if (!eqValues) return null

  const points = EQ_BANDS.map((freq, i) => {
    const v = eqValues[freq] ?? 0
    const x = (i / (EQ_BANDS.length - 1)) * W
    const y = H / 2 - (v / 12) * (H / 2 - 8)
    return [x, y]
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]},${p[1]}`).join(' ')
  const areaD = pathD + ` L ${W},${H/2} L 0,${H/2} Z`

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', opacity: enabled ? 1 : 0.3 }}>
      <line x1="0" y1={H/2} x2={W} y2={H/2} stroke={T.border} strokeWidth="1"/>
      <path d={areaD}  fill={`${T.accent}22`}/>
      <path d={pathD}  fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round"/>
      {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill={T.accent}/>)}
    </svg>
  )
}
