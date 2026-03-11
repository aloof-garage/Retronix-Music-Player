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
  const canvasRef  = useRef(null)
  const vizRef     = useRef(null)
  const [vizType, setVizType] = useState('spectrum')
  const { getAnalyser, state } = usePlayer()

  // ── Init once: pass the getter so Visualizer fetches analyser each frame ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const viz = new Visualizer(canvas, getAnalyser, T)
    viz.setType(vizType)
    viz.start()
    vizRef.current = viz

    return () => viz.stop()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the getter ref fresh in the Visualizer (e.g. after theme changes)
  useEffect(() => {
    vizRef.current?.setAnalyserGetter(getAnalyser)
  }, [getAnalyser])

  // Theme updates
  useEffect(() => {
    vizRef.current?.setTheme(T)
  }, [T])

  // Type changes — restart the visualizer on the same canvas
  const handleTypeChange = (type) => {
    setVizType(type)
    vizRef.current?.setType(type)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>VISUALIZER</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>AUDIO SPECTRUM DISPLAY</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIZ_TYPES.map(v => (
            <HWButton key={v.id} size="sm" theme={T} active={vizType === v.id} onClick={() => handleTypeChange(v.id)}>
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
        <canvas ref={canvasRef} width={800} height={300}
          style={{ width: '100%', display: 'block', borderRadius: 6 }}/>
      </div>

      {/* Info bar */}
      <div style={{
        display: 'flex', gap: 12, marginTop: 16, padding: 12,
        borderRadius: 10, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}`,
      }}>
        {[
          ['STATUS',  state.isPlaying ? 'PLAYING' : state.currentTrack ? 'PAUSED' : 'STOPPED'],
          ['TRACK',   state.currentTrack?.title || '—'],
          ['ARTIST',  state.currentTrack?.artist || '—'],
          ['MODE',    vizType.toUpperCase().replace('_', ' ')],
        ].map(([label, val]) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: '0.15em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
