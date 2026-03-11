import { useState, useEffect, useRef } from 'react'

// ── SVG Album Art Generator ───────────────────────────────────────────────────
export function AlbumArt({ color = '#e8834a', size = 56, trackId = 1, artworkPath = null }) {
  const [dataUrl, setDataUrl] = useState(null)

  useEffect(() => {
    if (artworkPath && window.electronAPI) {
      window.electronAPI.artwork.get(artworkPath).then(url => setDataUrl(url))
    } else {
      setDataUrl(null)
    }
  }, [artworkPath])

  if (dataUrl) {
    return (
      <img src={dataUrl} width={size} height={size}
        style={{ borderRadius: 4, display: 'block', objectFit: 'cover' }} alt="Album artwork"/>
    )
  }

  const patterns = [
    <g key="a">
      <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5"/>
      <circle cx="50" cy="50" r="25" fill="none" stroke={color} strokeWidth="2" opacity="0.7"/>
      <circle cx="50" cy="50" r="14" fill={color} opacity="0.8"/>
      <circle cx="50" cy="50" r="6" fill="#1a1a2e"/>
    </g>,
    <g key="b">
      {[0,1,2,3,4].map(i => (
        <path key={i} d={`M5 ${20+i*14} Q30 ${10+i*14} 50 ${20+i*14} Q70 ${30+i*14} 95 ${20+i*14}`}
          fill="none" stroke={color} strokeWidth="1.5" opacity={0.3+i*0.1}/>
      ))}
      <circle cx="50" cy="50" r="10" fill={color} opacity="0.9"/>
    </g>,
    <g key="c">
      {[0,1,2,3,4].map(x => [0,1,2,3,4].map(y => (
        <circle key={`${x}${y}`} cx={10+x*20} cy={10+y*20}
          r={2+Math.abs(x-2)*0.5+Math.abs(y-2)*0.5} fill={color}
          opacity={0.3+Math.abs(x-2)*0.1}/>
      )))}
    </g>,
    <g key="d">
      <polygon points="50,5 95,50 50,95 5,50" fill="none" stroke={color} strokeWidth="2" opacity="0.4"/>
      <polygon points="50,20 80,50 50,80 20,50" fill="none" stroke={color} strokeWidth="2" opacity="0.6"/>
      <polygon points="50,35 65,50 50,65 35,50" fill={color} opacity="0.8"/>
      <circle cx="50" cy="50" r="6" fill="#1a1a2e"/>
    </g>,
  ]

  const idx = ((trackId || 1) - 1) % patterns.length
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
      style={{ borderRadius: 4, display: 'block', flexShrink: 0 }}>
      <rect width="100" height="100" fill="#1a1a2e"/>
      {patterns[idx]}
    </svg>
  )
}

// ── Analog Knob ───────────────────────────────────────────────────────────────
// value: 0–100 (linear percentage). angle range: -135° (min) → 0° (center/50) → +135° (max)
export function AnalogKnob({ value = 75, onChange, size = 72, label, theme: T }) {
  const [dragging, setDragging]   = useState(false)
  const startRef = useRef({ y: 0, v: 0 })
  const isDark = T?.bg?.startsWith('#1') || T?.bg?.startsWith('#0')

  // Map 0–100 → -135° to +135° (270° sweep)
  const angle = -135 + (value / 100) * 270

  const onMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    startRef.current = { y: e.clientY, v: value }
    document.body.style.cursor = 'ns-resize'
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const dy = startRef.current.y - e.clientY
      const newVal = Math.max(0, Math.min(100, startRef.current.v + dy * 0.75))
      onChange?.(newVal)
    }
    const onUp = () => { setDragging(false); document.body.style.cursor = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, onChange])

  const highlight = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)'
  const shadow    = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)'
  const indicatorColor = T?.knobIndicator || '#e8834a'
  const capSize = size * 0.56

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, userSelect: 'none' }}>
      <div
        onMouseDown={onMouseDown}
        style={{
          width: size, height: size, borderRadius: '50%', position: 'relative',
          cursor: 'ns-resize',
          background: T?.knobBg || (isDark
            ? 'radial-gradient(circle at 35% 30%, #2d3250 0%, #1a1d2e 60%, #0e1020 100%)'
            : 'radial-gradient(circle at 35% 30%, #f0f4f8 0%, #d8e0ea 60%, #bcc8d8 100%)'),
          boxShadow: isDark
            ? `4px 4px 12px ${shadow}, -2px -2px 8px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.4)`
            : `6px 6px 14px ${shadow}, -3px -3px 10px ${highlight}, inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.1)`,
          transition: dragging ? 'none' : 'box-shadow 0.2s',
        }}
      >
        {/* Tick marks ring */}
        <svg width={size} height={size}
          style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%', pointerEvents: 'none' }}>
          {Array.from({ length: 11 }).map((_, i) => {
            const a = (-135 + i * 27) * (Math.PI / 180)
            const r = size / 2 - 5
            const x1 = size/2 + r * Math.cos(a),        y1 = size/2 + r * Math.sin(a)
            const x2 = size/2 + (r - 4) * Math.cos(a),  y2 = size/2 + (r - 4) * Math.sin(a)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'} strokeWidth="1"/>
          })}
        </svg>

        {/* Glare */}
        <div style={{
          position: 'absolute', top: '8%', left: '8%', width: '35%', height: '35%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${highlight} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>

        {/* Center cap – the rotating part */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: capSize, height: capSize, borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(circle at 40% 35%, #2a2f4a, #12141f)'
            : 'radial-gradient(circle at 40% 35%, #e8edf4, #c8d0de)',
          boxShadow: isDark
            ? 'inset 2px 2px 6px rgba(0,0,0,0.7), inset -1px -1px 3px rgba(255,255,255,0.06)'
            : 'inset 2px 2px 5px rgba(0,0,0,0.15), inset -2px -2px 5px rgba(255,255,255,0.8)',
          overflow: 'hidden',
        }}>
          {/*
           * Indicator needle.
           * bottom:'50%'  →  bottom edge of needle is at the center of the cap (= rotation pivot)
           * transformOrigin:'50% 100%'  →  rotate around bottom edge (= cap center)
           * translateX(-50%)  →  center the 2px needle horizontally
           * rotate(angle)  →  at value=50 → 0° = straight up (12-o'clock)
           */}
          <div style={{
            position: 'absolute',
            width: '12%',
            height: '46%',
            bottom: '50%',
            left: '50%',
            background: indicatorColor,
            borderRadius: '2px 2px 0 0',
            transformOrigin: '50% 100%',
            transform: `translateX(-50%) rotate(${angle}deg)`,
            transition: dragging ? 'none' : 'transform 0.04s',
            boxShadow: `0 0 6px ${indicatorColor}bb`,
            pointerEvents: 'none',
          }}/>
        </div>
      </div>

      {label && (
        <span style={{
          fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: T?.textMuted || '#888',
          fontFamily: "'Courier New', monospace",
        }}>
          {label}
        </span>
      )}
    </div>
  )
}

// ── Hardware Button ───────────────────────────────────────────────────────────
export function HWButton({ children, active, onClick, size = 'md', theme: T, style = {} }) {
  const [pressed, setPressed] = useState(false)
  const pad = size === 'lg' ? '14px 24px' : size === 'sm' ? '5px 11px' : '8px 16px'
  const bg       = active ? (T?.accent || '#e8834a') : (T?.surfaceRaised || '#1e2235')
  const textColor = active ? '#fff' : (T?.textMuted || '#9aa')

  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        padding: pad, border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: "'Courier New', monospace",
        fontSize: size === 'sm' ? 10 : 12,
        letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700,
        color: textColor, background: bg,
        boxShadow: pressed ? (T?.neumorphIn || 'inset 2px 2px 5px rgba(0,0,0,0.7)')
                           : (T?.neumorphOut || '3px 3px 8px rgba(0,0,0,0.6)'),
        transform: pressed ? 'translateY(1px)' : 'translateY(0)',
        transition: 'box-shadow 0.1s, transform 0.1s',
        userSelect: 'none', outline: 'none',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ── Transport Button ──────────────────────────────────────────────────────────
export function TransportBtn({ children, onClick, isPrimary, theme: T }) {
  const [pressed, setPressed] = useState(false)
  const isDark = T?.bg?.startsWith('#1') || T?.bg?.startsWith('#0')
  const size = isPrimary ? 56 : 44

  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: '50%', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isPrimary
          ? `radial-gradient(circle at 35% 30%, ${T?.accent || '#e8834a'}, ${T?.accentDim || '#7a3a18'})`
          : (isDark
            ? 'radial-gradient(circle at 35% 30%, #2a2f4a, #12141f)'
            : 'radial-gradient(circle at 35% 30%, #e8edf4, #c8d0de)'),
        boxShadow: pressed
          ? (isDark
            ? 'inset 3px 3px 8px rgba(0,0,0,0.8), inset -1px -1px 4px rgba(255,255,255,0.06)'
            : 'inset 3px 3px 8px rgba(0,0,0,0.25), inset -2px -2px 5px rgba(255,255,255,0.7)')
          : (isPrimary
            ? '5px 5px 12px rgba(0,0,0,0.4), -2px -2px 8px rgba(255,165,100,0.3), inset 0 1px 0 rgba(255,200,150,0.5)'
            : (isDark
              ? '4px 4px 10px rgba(0,0,0,0.6), -1px -1px 5px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)'
              : '5px 5px 10px rgba(0,0,0,0.2), -3px -3px 8px rgba(255,255,255,0.9), inset 0 1px 0 rgba(255,255,255,0.95)')),
        transform: pressed ? 'scale(0.95)' : 'scale(1)',
        transition: 'transform 0.1s, box-shadow 0.1s',
        color: isPrimary ? '#fff' : (isDark ? '#ccc' : '#445'),
        outline: 'none', userSelect: 'none',
      }}
    >
      {children}
    </button>
  )
}

// ── Progress / Seek Slider ────────────────────────────────────────────────────
export function ProgressSlider({ value, max, onChange, theme: T }) {
  const pct    = max ? (value / max) * 100 : 0
  const accent = T?.accent || '#e8834a'
  const trackBg = `linear-gradient(90deg, ${accent} 0%, ${accent} ${pct}%, ${T?.inputBg || '#0e1020'} ${pct}%, ${T?.inputBg || '#0e1020'} 100%)`

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ width: '100%', height: 6, borderRadius: 3, background: T?.inputBg || '#0a0c18', boxShadow: T?.neumorphIn, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 3, background: trackBg }}/>
      </div>
      <input
        type="range" min="0" max={max || 1} step="0.1"
        value={value}
        onChange={e => onChange?.(Number(e.target.value))}
        style={{ position: 'absolute', top: '50%', left: 0, width: '100%', transform: 'translateY(-50%)', opacity: 0, cursor: 'pointer', height: 20, margin: 0, padding: 0 }}
      />
    </div>
  )
}

// ── VU Meter ──────────────────────────────────────────────────────────────────
export function VUMeter({ level = 0.7, theme: T }) {
  const bars = 20
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 28 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = i / bars
        const active = threshold < level
        const isRed    = i >= bars * 0.85
        const isYellow = i >= bars * 0.7
        const color = active
          ? (isRed ? (T?.vuClip || '#f44') : isYellow ? (T?.vuWarn || '#fa0') : (T?.vuActive || '#4c8'))
          : (T?.vuInactive || '#1a1d2e')
        return (
          <div key={i} style={{
            width: 4, height: 8 + (i / bars) * 14,
            background: color, borderRadius: 2,
            boxShadow: active ? `0 0 4px ${color}aa` : 'none',
            transition: 'background 0.08s',
          }}/>
        )
      })}
    </div>
  )
}

// ── LED Indicator ─────────────────────────────────────────────────────────────
export function LEDIndicator({ active, color = '#4cff88', size = 8, pulse = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: active ? color : 'rgba(0,0,0,0.3)',
      boxShadow: active ? `0 0 ${size}px ${color}, 0 0 ${size*2}px ${color}44` : 'none',
      transition: 'all 0.15s',
      animation: active && pulse ? 'ledPulse 1s ease-in-out infinite' : 'none',
    }}/>
  )
}

// ── LCD Display ───────────────────────────────────────────────────────────────
export function LCDDisplay({ children, theme: T, style = {} }) {
  return (
    <div style={{
      background: T?.lcdBg || '#06070f',
      color: T?.lcdText || '#00ff88',
      fontFamily: "'Courier New', monospace",
      padding: '4px 8px', borderRadius: 4,
      boxShadow: T?.neumorphIn || 'inset 2px 2px 6px rgba(0,0,0,0.8)',
      border: '1px solid rgba(0,255,0,0.1)',
      fontSize: 12, letterSpacing: '0.1em',
      ...style
    }}>
      {children}
    </div>
  )
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
export function ToggleSwitch({ active, onChange, theme: T, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div onClick={() => onChange?.(!active)}
        style={{
          width: 36, height: 18, borderRadius: 9, cursor: 'pointer', position: 'relative',
          background: active ? (T?.accent || '#e8834a') : (T?.surfaceDeep || '#0e1020'),
          boxShadow: T?.neumorphIn || 'inset 2px 2px 4px rgba(0,0,0,0.6)',
          transition: 'background 0.2s',
        }}>
        <div style={{
          position: 'absolute', top: 2, left: active ? 18 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: active ? '#fff' : (T?.textMuted || '#6a7488'),
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)', transition: 'left 0.2s',
        }}/>
      </div>
      {label && (
        <span style={{ fontSize: 10, letterSpacing: '0.1em', color: T?.textMuted || '#6a7488', textTransform: 'uppercase' }}>
          {label}
        </span>
      )}
    </div>
  )
}

// ── Spectrum Visualizer (compact bottom bar) ──────────────────────────────────
export function SpectrumVisualizer({ isPlaying, theme: T, analyser }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const barsRef   = useRef(Array.from({ length: 32 }, () => 0))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height

    const animate = () => {
      ctx.clearRect(0, 0, W, H)
      const barW = W / barsRef.current.length

      if (analyser && isPlaying) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        barsRef.current = barsRef.current.map((_, i) => {
          const idx = Math.floor((i / barsRef.current.length) * data.length * 0.7)
          const target = data[idx] / 255
          return barsRef.current[i] + (target - barsRef.current[i]) * 0.3
        })
      } else {
        barsRef.current = barsRef.current.map(v => v * 0.92)
      }

      barsRef.current.forEach((v, i) => {
        const h = Math.max(2, v * H)
        const x = i * barW + 0.5
        const y = H - h
        const gradient = ctx.createLinearGradient(0, y, 0, H)
        gradient.addColorStop(0, T?.spectrumTop || '#e8834a')
        gradient.addColorStop(0.6, T?.accent || '#c05a2a')
        gradient.addColorStop(1, T?.spectrumBottom || '#7a2a08')
        ctx.fillStyle = gradient
        ctx.fillRect(x, y, barW - 1.5, h)
      })

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying, T, analyser])

  return (
    <div style={{
      borderRadius: 6, overflow: 'hidden', padding: '4px 6px',
      background: T?.lcdBg || '#06070f',
      boxShadow: T?.neumorphIn || 'inset 2px 2px 8px rgba(0,0,0,0.9)',
    }}>
      <canvas ref={canvasRef} width={160} height={40} style={{ display: 'block' }}/>
    </div>
  )
}
