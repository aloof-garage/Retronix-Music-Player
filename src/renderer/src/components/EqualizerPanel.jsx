import { useState, useRef, useCallback, useEffect } from 'react'
import { HWButton, ToggleSwitch } from './UIComponents'
import { usePlayer } from '../store/PlayerStore'

const EQ_BANDS  = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const EQ_LABELS = ['31','62','125','250','500','1K','2K','4K','8K','16K']

// ── Built-in presets ──────────────────────────────────────────────────────────
const BUILTIN_PRESETS = [
  { id: 'flat',         label: 'FLAT',    gains: [0,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
  { id: 'bass_boost',   label: 'BASS+',   gains: [8,  6,  4,  2,  0,  0,  0,  0,  0,  0] },
  { id: 'treble_boost', label: 'TREBLE+', gains: [0,  0,  0,  0,  0,  0,  2,  4,  6,  8] },
  { id: 'rock',         label: 'ROCK',    gains: [5,  4,  3,  1,  0, -1,  1,  3,  4,  5] },
  { id: 'pop',          label: 'POP',     gains: [-1, 0,  2,  4,  3,  0, -1, -1,  0,  0] },
  { id: 'jazz',         label: 'JAZZ',    gains: [4,  3,  1,  2, -2, -2,  0,  1,  3,  4] },
  { id: 'classical',    label: 'CLASS',   gains: [5,  4,  3,  2, -1, -1,  0,  2,  3,  4] },
  { id: 'electronic',   label: 'ELEC',    gains: [4,  4,  2,  0, -2,  2,  1,  2,  4,  4] },
  { id: 'vocal',        label: 'VOCAL',   gains: [-2,-2,  0,  3,  5,  5,  3,  2, -1, -2] },
  { id: 'loudness',     label: 'LOUD',    gains: [6,  4,  0,  0, -2,  0,  0,  0,  4,  6] },
]

// ── Local-storage helpers ─────────────────────────────────────────────────────
function loadCustomPresets() {
  try { return JSON.parse(localStorage.getItem('retronix-eq-presets') || '[]') }
  catch { return [] }
}
function saveCustomPresets(presets) {
  try { localStorage.setItem('retronix-eq-presets', JSON.stringify(presets)) }
  catch { /* quota */ }
}

export function EqualizerPanel({ theme: T, eqValues, onEqChange, enabled, onToggle }) {
  const { applyEqPreset } = usePlayer()
  const [activePresetId, setActivePresetId]   = useState('flat')
  const [customPresets, setCustomPresets]     = useState(loadCustomPresets)
  const [showSaveInput, setShowSaveInput]     = useState(false)
  const [newPresetName, setNewPresetName]     = useState('')
  const saveInputRef = useRef(null)

  useEffect(() => { if (showSaveInput) saveInputRef.current?.focus() }, [showSaveInput])

  // Apply a built-in preset through the AudioEngine
  const applyBuiltin = (preset) => {
    const gains = applyEqPreset(preset.id)
    if (gains) EQ_BANDS.forEach(freq => onEqChange?.(freq, gains[freq] || 0))
    setActivePresetId(preset.id)
  }

  // Apply a custom preset (values only, not through AudioEngine preset map)
  const applyCustom = (preset) => {
    EQ_BANDS.forEach((freq, i) => {
      const gain = preset.bands[freq] ?? 0
      onEqChange?.(freq, gain)
    })
    setActivePresetId(`custom_${preset.id}`)
  }

  const handleSavePreset = () => {
    const name = newPresetName.trim()
    if (!name) return
    const preset = {
      id:    Date.now(),
      name,
      bands: { ...eqValues },
    }
    const updated = [...customPresets, preset]
    setCustomPresets(updated)
    saveCustomPresets(updated)
    setNewPresetName('')
    setShowSaveInput(false)
    setActivePresetId(`custom_${preset.id}`)
  }

  const deleteCustomPreset = (id) => {
    const updated = customPresets.filter(p => p.id !== id)
    setCustomPresets(updated)
    saveCustomPresets(updated)
    if (activePresetId === `custom_${id}`) setActivePresetId('')
  }

  const handleReset = () => applyBuiltin(BUILTIN_PRESETS[0])

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>EQUALIZER</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>10-BAND PARAMETRIC EQ</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ToggleSwitch active={enabled} onChange={onToggle} theme={T} label="EQ ON"/>
          <HWButton size="sm" theme={T} onClick={handleReset}>RESET</HWButton>
          <HWButton size="sm" theme={T} onClick={() => setShowSaveInput(s => !s)}>+ SAVE</HWButton>
        </div>
      </div>

      {/* Save preset input */}
      {showSaveInput && (
        <div style={{
          marginBottom: 16, padding: 12, borderRadius: 10,
          background: T.surfaceDeep, border: `1px solid ${T.accent}44`,
          boxShadow: T.neumorphIn, display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <input
            ref={saveInputRef}
            value={newPresetName}
            onChange={e => setNewPresetName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') { setShowSaveInput(false); setNewPresetName('') } }}
            placeholder="Preset name…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: T.text, fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.05em',
            }}
          />
          <HWButton size="sm" theme={T} onClick={handleSavePreset}>SAVE</HWButton>
          <HWButton size="sm" theme={T} onClick={() => { setShowSaveInput(false); setNewPresetName('') }}>×</HWButton>
        </div>
      )}

      {/* Band sliders */}
      <div style={{
        borderRadius: 12, padding: '20px 16px',
        background: T.surfaceDeep, boxShadow: T.neumorphIn,
        border: `1px solid ${T.border}`, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          {/* dB axis */}
          <div style={{
            width: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            height: 180, fontSize: 8, color: T.textMuted, textAlign: 'right', paddingRight: 6, flexShrink: 0,
          }}>
            <span>+12</span><span>+6</span><span>0</span><span>-6</span><span>-12</span>
          </div>
          {/* Sliders */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>
            {EQ_BANDS.map((freq, i) => (
              <EQSlider
                key={freq}
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

      {/* Built-in presets */}
      <div style={{ borderRadius: 12, padding: 16, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 12 }}>BUILT-IN PRESETS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {BUILTIN_PRESETS.map(preset => (
            <HWButton key={preset.id} size="sm" theme={T}
              active={activePresetId === preset.id && enabled}
              onClick={() => applyBuiltin(preset)}>
              {preset.label}
            </HWButton>
          ))}
        </div>
      </div>

      {/* Custom presets */}
      {customPresets.length > 0 && (
        <div style={{ borderRadius: 12, padding: 16, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.accent}22`, marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 12 }}>SAVED PRESETS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {customPresets.map(preset => (
              <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <HWButton size="sm" theme={T}
                  active={activePresetId === `custom_${preset.id}` && enabled}
                  onClick={() => applyCustom(preset)}>
                  {preset.name}
                </HWButton>
                <button
                  onClick={() => deleteCustomPreset(preset.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: T.textMuted, fontSize: 12, padding: '0 2px', lineHeight: 1,
                  }}
                  title="Delete preset"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EQ curve */}
      <div style={{ borderRadius: 12, padding: 16, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 8 }}>EQ CURVE</div>
        <EQCurve eqValues={eqValues} theme={T} enabled={enabled}/>
      </div>
    </div>
  )
}

// ── EQ Slider (pointer-events drag, no writing-mode) ──────────────────────────
function EQSlider({ label, value, onChange, theme: T, enabled }) {
  const TRACK_H = 160
  const MIN = -12, MAX = 12
  const trackRef  = useRef(null)
  const dragging  = useRef(false)
  const startY    = useRef(0)
  const startVal  = useRef(0)

  const clampSnap = (v) => Math.round(Math.max(MIN, Math.min(MAX, v)) * 2) / 2
  const valToY    = (v) => ((MAX - v) / (MAX - MIN)) * TRACK_H
  const yToVal    = (y) => clampSnap(MAX - (Math.max(0, Math.min(TRACK_H, y)) / TRACK_H) * (MAX - MIN))

  const thumbY    = valToY(value ?? 0)
  const display   = value ?? 0
  const fillH     = Math.abs(display) / MAX * (TRACK_H / 2)
  const fillTop   = display >= 0 ? TRACK_H / 2 - fillH : TRACK_H / 2

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    dragging.current = true
    startY.current   = e.clientY
    startVal.current = display
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [enabled, display])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return
    const newVal = yToVal(valToY(startVal.current) + (e.clientY - startY.current))
    if (newVal !== display) onChange?.(newVal)
  }, [display, onChange])

  const onPointerUp = useCallback(() => { dragging.current = false }, [])

  const onTrackClick = useCallback((e) => {
    if (!enabled) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    onChange?.(yToVal(e.clientY - rect.top))
  }, [enabled, onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 32 }}>
      <div style={{ fontSize: 9, color: T.accent, fontFamily: "'Courier New', monospace", minWidth: 30, textAlign: 'center', opacity: enabled ? 1 : 0.4 }}>
        {display > 0 ? '+' : ''}{display.toFixed(1)}
      </div>
      <div ref={trackRef} onClick={onTrackClick}
        style={{ position: 'relative', width: 10, height: TRACK_H, cursor: enabled ? 'pointer' : 'default' }}>
        {/* Rail */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 4, transform: 'translateX(-50%)', background: T.inputBg || T.surfaceDeep, borderRadius: 2, boxShadow: T.neumorphIn }}/>
        {/* Zero line */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: T.border, pointerEvents: 'none' }}/>
        {/* Fill */}
        {display !== 0 && (
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 4, borderRadius: 2, top: fillTop, height: fillH, background: enabled ? (T.eqBar || T.accent) : T.textMuted, opacity: enabled ? 1 : 0.3, pointerEvents: 'none' }}/>
        )}
        {/* Thumb */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            top: thumbY - 7, width: 20, height: 14, borderRadius: 4,
            background: enabled ? T.accent : T.textMuted,
            boxShadow: enabled ? `0 0 8px ${T.accent}88, 2px 2px 4px rgba(0,0,0,0.5)` : '1px 1px 3px rgba(0,0,0,0.4)',
            cursor: enabled ? 'ns-resize' : 'default',
            opacity: enabled ? 1 : 0.5,
            userSelect: 'none', touchAction: 'none', zIndex: 2,
          }}
        />
      </div>
      <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

// ── EQ Curve SVG ──────────────────────────────────────────────────────────────
function EQCurve({ eqValues, theme: T, enabled }) {
  const W = 400, H = 80
  if (!eqValues) return null
  const points = EQ_BANDS.map((freq, i) => {
    const v = eqValues[freq] ?? 0
    const x = (i / (EQ_BANDS.length - 1)) * W
    const y = H / 2 - (v / 12) * (H / 2 - 8)
    return [x, y]
  })
  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x},${y}`).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', opacity: enabled ? 1 : 0.3 }}>
      <line x1="0" y1={H/2} x2={W} y2={H/2} stroke={T.border} strokeWidth="1"/>
      <path d={`${pathD} L ${W},${H/2} L 0,${H/2} Z`} fill={`${T.accent}22`}/>
      <path d={pathD} fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round"/>
      {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill={T.accent}/>)}
    </svg>
  )
}
