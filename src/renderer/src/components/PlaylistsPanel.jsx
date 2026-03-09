import { useState, useEffect } from 'react'
import { HWButton } from './UIComponents'
import { AlbumArt } from './UIComponents'
import { useLibrary } from '../store/LibraryStore'
import { usePlayer } from '../store/PlayerStore'
import { formatTime, formatTotalDuration } from '../utils/helpers'

export function PlaylistsPanel({ theme: T }) {
  const { state, createPlaylist, deletePlaylist, getPlaylistTracks, exportPlaylist, importPlaylist } = useLibrary()
  const { playTrack } = usePlayer()
  const [selected, setSelected] = useState(null)
  const [tracks, setTracks] = useState([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (selected) {
      getPlaylistTracks(selected.id).then(t => setTracks(t || []))
    }
  }, [selected])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const id = await createPlaylist(newName.trim())
    setCreating(false)
    setNewName('')
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Playlist list */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: `1px solid ${T.border}`,
        padding: '20px 12px', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted }}>PLAYLISTS</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <HWButton size="sm" theme={T} onClick={importPlaylist}>⇓ IMPORT</HWButton>
            <HWButton size="sm" theme={T} onClick={() => setCreating(true)}>+ NEW</HWButton>
          </div>
        </div>

        {creating && (
          <div style={{
            padding: 10, borderRadius: 8, background: T.surfaceDeep,
            boxShadow: T.neumorphIn, border: `1px solid ${T.border}`, marginBottom: 10,
          }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
              placeholder="Playlist name..."
              style={{
                background: 'none', border: 'none', outline: 'none', color: T.text,
                fontSize: 11, width: '100%', fontFamily: 'inherit', letterSpacing: '0.05em',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <HWButton size="sm" theme={T} onClick={handleCreate}>CREATE</HWButton>
              <HWButton size="sm" theme={T} onClick={() => { setCreating(false); setNewName('') }}>CANCEL</HWButton>
            </div>
          </div>
        )}

        {state.playlists.length === 0 ? (
          <div style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '20px 0' }}>
            No playlists yet
          </div>
        ) : (
          state.playlists.map(pl => (
            <div
              key={pl.id}
              onClick={() => setSelected(pl)}
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                background: selected?.id === pl.id ? T.surfaceDeep : 'transparent',
                color: selected?.id === pl.id ? T.accent : T.text,
                boxShadow: selected?.id === pl.id ? T.neumorphIn : 'none',
                marginBottom: 4, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', transition: 'all 0.1s',
              }}
            >
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.05em', marginBottom: 2 }}>{pl.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted }}>{pl.description || '—'}</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deletePlaylist(pl.id); if (selected?.id === pl.id) setSelected(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 14 }}
              >×</button>
            </div>
          ))
        )}
      </div>

      {/* Playlist tracks */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>
                  {selected.name.toUpperCase()}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
                  {tracks.length} TRACKS · {formatTotalDuration(tracks.reduce((a, t) => a + (t.duration || 0), 0))}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {tracks.length > 0 && (
                  <HWButton size="sm" theme={T} onClick={() => playTrack(tracks[0], tracks)}>▶ PLAY</HWButton>
                )}
                <HWButton size="sm" theme={T} onClick={() => exportPlaylist(selected.id)}>⇑ EXPORT</HWButton>
              </div>
            </div>

            {tracks.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textMuted, padding: '40px 0', textAlign: 'center' }}>
                This playlist is empty. Right-click tracks to add them.
              </div>
            ) : (
              <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: T.neumorphIn, background: T.surfaceDeep }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '30px 1fr 1fr 50px 50px',
                  padding: '8px 14px', borderBottom: `1px solid ${T.border}`,
                  fontSize: 9, letterSpacing: '0.15em', color: T.textMuted,
                }}>
                  <span>#</span><span>TITLE</span><span>ALBUM</span><span>PLAYS</span><span>TIME</span>
                </div>
                {tracks.map((track, i) => (
                  <div
                    key={track.id}
                    onDoubleClick={() => playTrack(track, tracks)}
                    style={{
                      display: 'grid', gridTemplateColumns: '30px 1fr 1fr 50px 50px',
                      padding: '10px 14px', cursor: 'pointer', alignItems: 'center',
                      borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    <span style={{ fontSize: 10, color: T.textMuted }}>{i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <AlbumArt color={track.color} size={28} trackId={track.id}/>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {track.title}
                        </div>
                        <div style={{ fontSize: 9, color: T.textMuted }}>{track.artist}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {track.album}
                    </span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{track.plays || 0}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{formatTime(track.duration)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ fontSize: 14, color: T.textMuted, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.2 }}>≡</div>
              Select a playlist or create a new one
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
