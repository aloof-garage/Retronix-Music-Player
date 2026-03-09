import { useState } from 'react'
import { AlbumArt, HWButton } from './UIComponents'
import { formatTime } from '../utils/helpers'
import { usePlayer } from '../store/PlayerStore'

export function QueuePanel({ theme: T }) {
  const { state, playTrack, setQueue } = usePlayer()
  const { queue, queueIndex, currentTrack, isPlaying, shuffleOn, shuffledQueue } = state

  const displayQueue = shuffleOn ? shuffledQueue : queue

  const handleClearQueue = () => {
    setQueue([])
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>QUEUE</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
            {displayQueue.length} TRACKS
            {shuffleOn && ' · SHUFFLED'}
          </p>
        </div>
        {displayQueue.length > 0 && (
          <HWButton size="sm" theme={T} onClick={handleClearQueue}>CLEAR</HWButton>
        )}
      </div>

      {displayQueue.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 60, gap: 12,
        }}>
          <div style={{ fontSize: 40, opacity: 0.2 }}>⊞</div>
          <div style={{ fontSize: 12, color: T.textMuted }}>Queue is empty</div>
        </div>
      ) : (
        <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: T.neumorphIn, background: T.surfaceDeep }}>
          {displayQueue.map((track, i) => {
            const isActive = currentTrack?.id === track.id
            const isPast = i < queueIndex

            return (
              <div
                key={`${track.id}-${i}`}
                onDoubleClick={() => {
                  playTrack(track, displayQueue)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: `1px solid ${T.border}`,
                  background: isActive ? T.activeRow : 'transparent',
                  opacity: isPast ? 0.4 : 1,
                  transition: 'background 0.1s, opacity 0.15s',
                }}
              >
                <span style={{ fontSize: 10, color: isActive ? T.accent : T.textMuted, width: 20, textAlign: 'center' }}>
                  {isActive && isPlaying ? '▶' : i + 1}
                </span>
                <AlbumArt color={track.color} size={32} trackId={track.id} artworkPath={track.artwork_path}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, color: isActive ? T.accent : T.text, fontWeight: isActive ? 700 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{track.title}</div>
                  <div style={{ fontSize: 9, color: T.textMuted }}>{track.artist}</div>
                </div>
                <span style={{ fontSize: 10, color: T.textMuted, flexShrink: 0 }}>{formatTime(track.duration)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
