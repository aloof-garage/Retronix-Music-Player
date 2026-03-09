import { useEffect, useRef, useState } from 'react'
import { HWButton } from './UIComponents'
import { Visualizer } from '../engine/Visualizer'
import { usePlayer } from '../store/PlayerStore'

const VIZ_TYPES = [
  { id: 'spectrum',     label: 'SPECTRUM'  },
  { id: 'waveform',     label: 'WAVEFORM'  },
  { id: 'led_bars',     label: 'LED BARS'  },
  { id: 'circular',     label: 'CIRCULAR'  },
  { id: 'oscilloscope', label: 'OSCIL'     },
]

export function VisualizerPanel({ theme: T }) {
  const canvasRef = useRef(null)
  const vizRef = useRef(null)
  const [vizType, setVizType] = useState('spectrum')
  const { getAnalyser, state } = usePlayer()

  // ── Init visualizer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const analyser = getAnalyser()
    vizRef.current = new Visualizer(canvas, analyser, T)
    vizRef.current.setType(vizType)
    vizRef.current.start()

    return () => vizRef.current?.stop()
  }, [])

  // ── Update analyser when it changes ─────────────────────────────────────
  useEffect(() => {
    if (!vizRef.current) return
    vizRef.current.analyser = getAnalyser()
  }, [state.isPlaying, getAnalyser])

  // ── Update theme ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (vizRef.current) vizRef.current.setTheme(T)
  }, [T])

  // ── Change type ──────────────────────────────────────────────────────────
  const handleTypeChange = (type) => {
    setVizType(type)
    if (vizRef.current) vizRef.current.setType(type)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>VISUALIZER</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
            AUDIO SPECTRUM DISPLAY
          </p>
        </div>
        {/* Type selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {VIZ_TYPES.map(v => (
            <HWButton
              key={v.id}
              size="sm"
              theme={T}
              active={vizType === v.id}
              onClick={() => handleTypeChange(v.id)}
            >
              {v.label}
            </HWButton>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div style={{
        borderRadius: 12, overflow: 'hidden', padding: 8,
        background: T.lcdBg || '#06070f',
        boxShadow: `${T.neumorphIn}, 0 0 30px rgba(0,0,0,0.5)`,
        border: `1px solid ${T.border}`,
      }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          style={{ width: '100%', display: 'block', borderRadius: 6 }}
        />
      </div>

      {/* Info */}
      <div style={{
        display: 'flex', gap: 12, marginTop: 16,
        padding: 12, borderRadius: 10,
        background: T.surfaceDeep, boxShadow: T.neumorphIn,
        border: `1px solid ${T.border}`,
      }}>
        {[
          ['STATUS', state.isPlaying ? 'PLAYING' : 'STOPPED'],
          ['TRACK', state.currentTrack?.title || '—'],
          ['TYPE', vizType.toUpperCase().replace('_', ' ')],
          ['FPS', '60'],
        ].map(([label, val]) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: '0.15em', marginBottom: 3 }}>
              {label}
            </div>
            <div style={{
              fontSize: 11, color: T.text, letterSpacing: '0.05em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {val}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
