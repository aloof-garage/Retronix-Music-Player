import { useState, useEffect, useCallback } from 'react'
import { HWButton, AlbumArt } from './UIComponents'
import { useLibrary } from '../store/LibraryStore'
import { usePlayer } from '../store/PlayerStore'
import { formatTime, formatTotalDuration } from '../utils/helpers'

export function PlaylistsPanel({ theme: T }) {
  const {
    state, createPlaylist, deletePlaylist, getPlaylistTracks,
    exportPlaylist, importPlaylist, addTrackToPlaylist, removeTrackFromPlaylist
  } = useLibrary()
  const { playTrack, addToQueue } = usePlayer()

  const [selected,  setSelected]  = useState(null)
  const [tracks,    setTracks]    = useState([])
  const [creating,  setCreating]  = useState(false)
  const [newName,   setNewName]   = useState('')
  const [addingTracks, setAddingTracks] = useState(false)
  const [searchQ,   setSearchQ]   = useState('')

  // Reload tracks when selected changes
  const reloadTracks = useCallback(async (pl) => {
    if (!pl) return setTracks([])
    const t = await getPlaylistTracks(pl.id)
    setTracks(t || [])
  }, [getPlaylistTracks])

  useEffect(() => { reloadTracks(selected) }, [selected?.id])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const id = await createPlaylist(newName.trim())
    setCreating(false); setNewName('')
    // Select the newly created playlist
    const pl = state.playlists.find(p => p.id === id) || { id, name: newName.trim() }
    setSelected(pl)
  }

  const handleRemoveTrack = async (trackId) => {
    if (!selected) return
    await removeTrackFromPlaylist(selected.id, trackId)
    reloadTracks(selected)
  }

  // Library track browser for adding tracks
  const libraryTracks = state.tracks
  const filteredLibrary = searchQ
    ? libraryTracks.filter(t =>
        (t.title || '').toLowerCase().includes(searchQ.toLowerCase()) ||
        (t.artist || '').toLowerCase().includes(searchQ.toLowerCase()))
    : libraryTracks.slice(0, 200)

  const handleAddTrack = async (track) => {
    if (!selected) return
    await addTrackToPlaylist(selected.id, track.id)
    reloadTracks(selected)
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Playlist list */}
      <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${T.border}`, padding: '20px 12px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted }}>PLAYLISTS</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <HWButton size="sm" theme={T} onClick={importPlaylist}>⇓</HWButton>
            <HWButton size="sm" theme={T} onClick={() => setCreating(true)}>+ NEW</HWButton>
          </div>
        </div>

        {creating && (
          <div style={{ padding: 10, borderRadius: 8, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}`, marginBottom: 8 }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
              placeholder="Playlist name..."
              style={{ background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 11, width: '100%', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <HWButton size="sm" theme={T} onClick={handleCreate}>CREATE</HWButton>
              <HWButton size="sm" theme={T} onClick={() => { setCreating(false); setNewName('') }}>CANCEL</HWButton>
            </div>
          </div>
        )}

        {state.playlists.length === 0 ? (
          <div style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '20px 0' }}>No playlists yet</div>
        ) : (
          state.playlists.map(pl => (
            <div key={pl.id} onClick={() => setSelected(pl)}
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                background: selected?.id === pl.id ? T.surfaceDeep : 'transparent',
                color: selected?.id === pl.id ? T.accent : T.text,
                boxShadow: selected?.id === pl.id ? T.neumorphIn : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.05em' }}>{pl.name}</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deletePlaylist(pl.id); if (selected?.id === pl.id) { setSelected(null); setTracks([]) } }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 14, padding: '0 2px' }}>×</button>
            </div>
          ))
        )}
      </div>

      {/* Playlist tracks pane */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {selected ? (
          <>
            {/* Playlist header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>{selected.name.toUpperCase()}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
                  {tracks.length} TRACKS · {formatTotalDuration(tracks.reduce((a, t) => a + (t.duration || 0), 0))}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {tracks.length > 0 && <HWButton size="sm" theme={T} onClick={() => playTrack(tracks[0], tracks)}>▶ PLAY</HWButton>}
                <HWButton size="sm" theme={T} active={addingTracks} onClick={() => setAddingTracks(v => !v)}>
                  {addingTracks ? '× CLOSE' : '+ ADD TRACKS'}
                </HWButton>
                <HWButton size="sm" theme={T} onClick={() => exportPlaylist(selected.id)}>⇑ EXPORT</HWButton>
              </div>
            </div>

            {/* Add tracks panel */}
            {addingTracks && (
              <div style={{
                marginBottom: 16, borderRadius: 10,
                background: T.surfaceDeep, boxShadow: T.neumorphIn,
                border: `1px solid ${T.accent}44`, overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: T.textMuted, fontSize: 12 }}>⊕</span>
                  <input
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    placeholder="Search tracks to add..."
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 11, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  {filteredLibrary.map(track => {
                    const inPlaylist = tracks.some(t => t.id === track.id)
                    return (
                      <div key={track.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 14px', borderBottom: `1px solid ${T.border}`,
                          opacity: inPlaylist ? 0.5 : 1,
                        }}>
                        <AlbumArt color={track.color} size={24} trackId={track.id}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
                          <div style={{ fontSize: 9, color: T.textMuted }}>{track.artist}</div>
                        </div>
                        <button
                          onClick={() => !inPlaylist && handleAddTrack(track)}
                          disabled={inPlaylist}
                          style={{
                            background: inPlaylist ? T.surfaceDeep : T.accent,
                            border: 'none', borderRadius: 4, padding: '3px 8px',
                            cursor: inPlaylist ? 'default' : 'pointer',
                            fontSize: 10, color: inPlaylist ? T.textMuted : '#fff',
                            fontFamily: 'inherit', letterSpacing: '0.05em',
                          }}>
                          {inPlaylist ? '✓' : '+ ADD'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Track list */}
            {tracks.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textMuted, padding: '40px 0', textAlign: 'center' }}>
                Playlist is empty — click <strong style={{ color: T.accent }}>+ ADD TRACKS</strong> or right-click any track in the Library.
              </div>
            ) : (
              <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: T.neumorphIn, background: T.surfaceDeep }}>
                <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 50px 50px 40px', padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 9, letterSpacing: '0.15em', color: T.textMuted }}>
                  <span>#</span><span>TITLE</span><span>ALBUM</span><span>PLAYS</span><span>TIME</span><span></span>
                </div>
                {tracks.map((track, i) => (
                  <div key={`${track.id}-${i}`}
                    onDoubleClick={() => playTrack(track, tracks)}
                    style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 50px 50px 40px', padding: '10px 14px', cursor: 'pointer', alignItems: 'center', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <AlbumArt color={track.color} size={28} trackId={track.id}/>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
                        <div style={{ fontSize: 9, color: T.textMuted }}>{track.artist}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.album}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{track.plays || 0}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{formatTime(track.duration)}</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleRemoveTrack(track.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 13, padding: 0 }}
                      title="Remove from playlist">×</button>
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
