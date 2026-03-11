import { useEffect, useRef, useState, useCallback } from 'react'
import { AlbumArt, AnalogKnob, TransportBtn, VUMeter, SpectrumVisualizer, HWButton, LEDIndicator } from './UIComponents'
import { formatTime } from '../utils/helpers'
import { usePlayer } from '../store/PlayerStore'

export function PlaybackConsole({ theme: T, onToggleFav, eqValues, onEqChange }) {
  const {
    state, togglePlay, nextTrack, prevTrack,
    seek, setSeeking, setVolume, toggleShuffle, cycleRepeat, getAnalyser,
  } = usePlayer()
  const { currentTrack, isPlaying, currentTime, duration, volume, shuffleOn, repeatMode } = state

  const [vuLevel,     setVuLevel]     = useState(0.08)
  const [seekVal,     setSeekVal]     = useState(0)      // 0-100
  const isDraggingRef = useRef(false)
  const [showDrag,    setShowDrag]    = useState(false)  // controls time label display only
  const analyser = getAnalyser()

  // ── Sync seek bar with playback (not while dragging) ──────────────────────
  useEffect(() => {
    if (!isDraggingRef.current) {
      setSeekVal(duration > 0 ? (currentTime / duration) * 100 : 0)
    }
  }, [currentTime, duration])

  // ── VU meter from analyser ────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !analyser) { setVuLevel(0.08); return }
    const id = setInterval(() => {
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      setVuLevel((sum / data.length / 255) * 1.5)
    }, 80)
    return () => clearInterval(id)
  }, [isPlaying, analyser])

  // ── Seek bar: window-level mouseup so release outside bar still commits ───
  const handleSeekMouseDown = useCallback((e) => {
    isDraggingRef.current = true
    setSeeking(true)
    setShowDrag(true)
    // Update immediately on mousedown (click-to-seek)
    const rect = e.currentTarget.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setSeekVal(pct * 100)
  }, [setSeeking])

  const handleSeekInputChange = useCallback((e) => {
    setSeekVal(Number(e.target.value))
  }, [])

  // Commit on window mouseup — works even if pointer drifts off element
  useEffect(() => {
    const onUp = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      setShowDrag(false)
      setSeeking(false)
      // Read current seekVal via ref to avoid stale closure
      setSeekVal(prev => {
        seek((prev / 100) * (duration || 1))
        return prev
      })
    }
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => { window.removeEventListener('mouseup', onUp); window.removeEventListener('touchend', onUp) }
  }, [seek, duration, setSeeking])

  const pct     = seekVal
  const accent  = T.accent || '#e8834a'
  const trackBg = `linear-gradient(90deg, ${accent} 0%, ${accent} ${pct}%, ${T.inputBg || '#0e1020'} ${pct}%, ${T.inputBg || '#0e1020'} 100%)`
  const repeatLabels = ['↺ OFF', '↺ ALL', '↺ ONE']

  return (
    <div style={{
      height: 164, background: T.surface, flexShrink: 0,
      borderTop: `2px solid ${T.border}`,
      boxShadow: `0 -4px 20px ${T.shadowDown}, 0 -1px 0 ${T.shadowUp}`,
      display: 'flex', alignItems: 'center', padding: '0 24px', gap: 20,
      position: 'relative', zIndex: 10,
    }}>
      {/* Panel texture */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025,
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 4px)` }}/>

      {/* ── Album Art + Track Info ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: 270, flexShrink: 0 }}>
        <div style={{ borderRadius: 8, overflow: 'hidden', boxShadow: `4px 4px 12px ${T.shadowDown}, -2px -2px 6px ${T.shadowUp}, inset 0 0 0 1px ${T.border}` }}>
          <AlbumArt color={currentTrack?.color} size={82} trackId={currentTrack?.id} artworkPath={currentTrack?.artwork_path}/>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.07em', color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentTrack?.title || 'No Track'}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3, letterSpacing: '0.05em' }}>
            {currentTrack?.artist || '—'}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            {currentTrack?.album || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <button onClick={() => currentTrack && onToggleFav?.(currentTrack.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: currentTrack?.favorite ? T.accent : T.textMuted, padding: 0, lineHeight: 1 }}>
              {currentTrack?.favorite ? '♥' : '♡'}
            </button>
            {currentTrack?.codec && (
              <span style={{ fontSize: 9, letterSpacing: '0.1em', padding: '2px 5px', borderRadius: 3, background: T.surfaceDeep, color: T.textMuted, border: `1px solid ${T.border}` }}>
                {currentTrack.codec}
              </span>
            )}
            {isPlaying && <LEDIndicator active color={T.ledGreen || '#4cff88'} size={7} pulse />}
          </div>
        </div>
      </div>

      {/* ── Center: Transport + Seek bar ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        {/* Transport row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HWButton active={shuffleOn} onClick={toggleShuffle} size="sm" theme={T}>⇌ SHUF</HWButton>
          <TransportBtn onClick={prevTrack} theme={T}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </TransportBtn>
          <TransportBtn isPrimary onClick={togglePlay} theme={T}>
            {isPlaying
              ? <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>
              : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </TransportBtn>
          <TransportBtn onClick={nextTrack} theme={T}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14 5.09 3.64L8 12.86v-3zm7.5-3.86h2v12h-2z"/></svg>
          </TransportBtn>
          <HWButton active={repeatMode > 0} onClick={cycleRepeat} size="sm" theme={T}>{repeatLabels[repeatMode]}</HWButton>
        </div>

        {/* ── Seek bar ── */}
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums', width: 38, textAlign: 'right' }}>
            {showDrag ? formatTime((seekVal / 100) * (duration || 1)) : formatTime(currentTime)}
          </span>
          <div
            style={{ flex: 1, position: 'relative', cursor: 'pointer' }}
            onMouseDown={handleSeekMouseDown}
          >
            {/* Visual track */}
            <div style={{ width: '100%', height: 7, borderRadius: 4, background: T.inputBg || '#0a0c18', boxShadow: T.neumorphIn, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: trackBg }}/>
            </div>
            {/* Invisible range input for keyboard / accessibility */}
            <input
              type="range" min="0" max="100" step="0.05"
              value={seekVal}
              onChange={handleSeekInputChange}
              style={{ position: 'absolute', top: '50%', left: 0, width: '100%', transform: 'translateY(-50%)', opacity: 0, cursor: 'pointer', height: 24, margin: 0, padding: 0 }}
            />
          </div>
          <span style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums', width: 38 }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* ── Right: Mini spectrum + VU + Knobs ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <SpectrumVisualizer isPlaying={isPlaying} theme={T} analyser={analyser}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <VUMeter level={isPlaying ? vuLevel : 0.08} theme={T}/>
            <VUMeter level={isPlaying ? vuLevel * 0.88 : 0.06} theme={T}/>
          </div>
        </div>

        <div style={{ width: 1, height: 80, background: T.border }}/>

        <AnalogKnob value={volume} onChange={setVolume} size={74} label="Vol" theme={T}/>

        <div style={{ width: 1, height: 80, background: T.border }}/>

        {/* EQ mini knobs — value is remapped: 0dB = center (50), ±12dB = 0/100 */}
        <div style={{ display: 'flex', gap: 14 }}>
          <AnalogKnob
            value={50 + (eqValues?.[62] || 0) * (50/12)}
            onChange={v => onEqChange?.(62, (v - 50) * (12/50))}
            size={42} label="Bass" theme={T}
          />
          <AnalogKnob
            value={50 + (eqValues?.[1000] || 0) * (50/12)}
            onChange={v => onEqChange?.(1000, (v - 50) * (12/50))}
            size={42} label="Mid" theme={T}
          />
          <AnalogKnob
            value={50 + (eqValues?.[8000] || 0) * (50/12)}
            onChange={v => onEqChange?.(8000, (v - 50) * (12/50))}
            size={42} label="Treb" theme={T}
          />
        </div>
      </div>
    </div>
  )
}
