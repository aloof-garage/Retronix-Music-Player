import { useEffect, useRef, useState } from 'react'
import {
  AlbumArt, AnalogKnob, TransportBtn, ProgressSlider,
  VUMeter, SpectrumVisualizer, HWButton, LEDIndicator
} from './UIComponents'
import { formatTime } from '../utils/helpers'
import { usePlayer } from '../store/PlayerStore'

export function PlaybackConsole({ theme: T, onToggleFav, eqValues, onEqChange }) {
  const {
    state, togglePlay, nextTrack, prevTrack, seek,
    setVolume, toggleShuffle, cycleRepeat, getAnalyser
  } = usePlayer()
  const { currentTrack, isPlaying, currentTime, duration, volume, shuffleOn, repeatMode } = state
  const [vuLevel, setVuLevel] = useState(0.3)
  const analyser = getAnalyser()

  // Simulate VU from analyser
  useEffect(() => {
    if (!isPlaying || !analyser) {
      setVuLevel(0.08)
      return
    }
    const id = setInterval(() => {
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      const avg = sum / data.length / 255
      setVuLevel(avg * 1.5)
    }, 80)
    return () => clearInterval(id)
  }, [isPlaying, analyser])

  const handleSeek = (v) => {
    seek((v / 100) * (duration || 1))
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const repeatLabels = ['↺ REP', '↺ ALL', '↺ ONE']

  return (
    <div style={{
      height: 160, background: T.surface, flexShrink: 0,
      borderTop: `2px solid ${T.border}`,
      boxShadow: `0 -4px 20px ${T.shadowDown}, 0 -1px 0 ${T.shadowUp}`,
      display: 'flex', alignItems: 'center', padding: '0 24px', gap: 20,
      position: 'relative', zIndex: 10,
    }}>
      {/* Panel texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025,
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 4px)`,
      }}/>

      {/* ── Album Art + Track Info ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: 260, flexShrink: 0 }}>
        <div style={{
          borderRadius: 8, overflow: 'hidden',
          boxShadow: `4px 4px 12px ${T.shadowDown}, -2px -2px 6px ${T.shadowUp}, inset 0 0 0 1px ${T.border}`,
        }}>
          <AlbumArt
            color={currentTrack?.color}
            size={80}
            trackId={currentTrack?.id}
            artworkPath={currentTrack?.artwork_path}
          />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: T.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {currentTrack?.title || 'No Track'}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3, letterSpacing: '0.06em' }}>
            {currentTrack?.artist || '—'}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
            {currentTrack?.album || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <button
              onClick={() => currentTrack && onToggleFav?.(currentTrack.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                color: currentTrack?.favorite ? T.accent : T.textMuted, padding: 0, lineHeight: 1,
              }}
            >
              {currentTrack?.favorite ? '♥' : '♡'}
            </button>
            {currentTrack?.codec && (
              <span style={{
                fontSize: 8, letterSpacing: '0.1em', padding: '2px 5px',
                borderRadius: 3, background: T.surfaceDeep, color: T.textMuted,
                border: `1px solid ${T.border}`,
              }}>
                {currentTrack.codec}
              </span>
            )}
            {isPlaying && <LEDIndicator active color={T.ledGreen || '#4cff88'} size={6} pulse />}
          </div>
        </div>
      </div>

      {/* ── Center: Transport + Progress ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        {/* Transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HWButton active={shuffleOn} onClick={toggleShuffle} size="sm" theme={T}>⇌ SHUF</HWButton>
          <TransportBtn onClick={prevTrack} theme={T}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </TransportBtn>
          <TransportBtn isPrimary onClick={togglePlay} theme={T}>
            {isPlaying
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6zm8-14v14h4V5z"/>
                </svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
            }
          </TransportBtn>
          <TransportBtn onClick={nextTrack} theme={T}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zm2-8.14 5.09 3.64L8 12.86v-3zm7.5-3.86h2v12h-2z"/>
            </svg>
          </TransportBtn>
          <HWButton active={repeatMode > 0} onClick={cycleRepeat} size="sm" theme={T}>
            {repeatLabels[repeatMode]}
          </HWButton>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, color: T.textMuted, fontVariantNumeric: 'tabular-nums',
            width: 36, textAlign: 'right',
          }}>
            {formatTime(currentTime)}
          </span>
          <div style={{ flex: 1 }}>
            <ProgressSlider
              value={progress}
              max={100}
              onChange={handleSeek}
              theme={T}
            />
          </div>
          <span style={{ fontSize: 10, color: T.textMuted, fontVariantNumeric: 'tabular-nums', width: 36 }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* ── Right: Visualizer + Knobs ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
        {/* Spectrum + VU */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <SpectrumVisualizer isPlaying={isPlaying} theme={T} analyser={analyser}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <VUMeter level={isPlaying ? vuLevel : 0.08} theme={T}/>
            <VUMeter level={isPlaying ? vuLevel * 0.88 : 0.06} theme={T}/>
          </div>
        </div>

        <div style={{ width: 1, height: 80, background: T.border }}/>

        {/* Volume knob */}
        <AnalogKnob value={volume} onChange={setVolume} size={72} label="Volume" theme={T}/>

        <div style={{ width: 1, height: 80, background: T.border }}/>

        {/* EQ mini knobs */}
        <div style={{ display: 'flex', gap: 16 }}>
          <AnalogKnob
            value={50 + (eqValues?.[62] || 0) * (50/12)}
            onChange={v => onEqChange?.(62, (v - 50) * (12/50))}
            size={40} label="Bass" theme={T}
          />
          <AnalogKnob
            value={50 + (eqValues?.[1000] || 0) * (50/12)}
            onChange={v => onEqChange?.(1000, (v - 50) * (12/50))}
            size={40} label="Mid" theme={T}
          />
          <AnalogKnob
            value={50 + (eqValues?.[8000] || 0) * (50/12)}
            onChange={v => onEqChange?.(8000, (v - 50) * (12/50))}
            size={40} label="Treble" theme={T}
          />
        </div>
      </div>
    </div>
  )
}
