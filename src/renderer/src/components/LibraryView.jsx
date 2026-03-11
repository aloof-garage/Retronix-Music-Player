import { useState, useCallback, memo, useRef, useEffect } from 'react'
import { AlbumArt, HWButton } from './UIComponents'
import { formatTime, formatTotalDuration } from '../utils/helpers'
import { usePlayer } from '../store/PlayerStore'
import { useLibrary } from '../store/LibraryStore'

// ── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, track, playlists, onClose, onPlay, onAddToQueue, onToggleFav, onAddToPlaylist, onShowInFolder, theme: T }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  // Clamp to viewport
  const style = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top:  Math.min(y, window.innerHeight - 300),
    zIndex: 9999,
    minWidth: 200,
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
    overflow: 'hidden',
    fontFamily: "'Courier New', monospace",
  }
  const item = (label, icon, action, danger) => (
    <button
      onClick={() => { action(); onClose() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', background: 'none', border: 'none',
        padding: '8px 14px', cursor: 'pointer', textAlign: 'left',
        fontSize: 11, letterSpacing: '0.06em',
        color: danger ? '#ff6b6b' : T.text,
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.activeRow }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      <span style={{ width: 16, textAlign: 'center', fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  )
  const sep = () => <div style={{ height: 1, background: T.border, margin: '4px 0' }}/>

  return (
    <div ref={ref} style={style}>
      <div style={{ padding: '6px 14px 4px', fontSize: 9, color: T.accent, letterSpacing: '0.15em', borderBottom: `1px solid ${T.border}` }}>
        {track.title}
      </div>
      {item('Play Now', '▶', onPlay)}
      {item('Add to Queue', '+', onAddToQueue)}
      {sep()}
      {playlists.length > 0 && (
        <div>
          <div style={{ padding: '4px 14px 2px', fontSize: 9, color: T.textMuted, letterSpacing: '0.1em' }}>ADD TO PLAYLIST</div>
          {playlists.map(pl => (
            item(pl.name, '≡', () => onAddToPlaylist(pl.id), false)
          ))}
          {sep()}
        </div>
      )}
      {item(track.favorite ? 'Remove from Favorites' : 'Add to Favorites', '♥', onToggleFav)}
      {window.electronAPI && item('Show in Folder', '⇒', onShowInFolder)}
    </div>
  )
}

// ── Track Row ─────────────────────────────────────────────────────────────────
const TrackRow = memo(function TrackRow({ track, index, isActive, isPlaying, onPlay, onToggleFav, onContextMenu, theme: T }) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onDoubleClick={() => onPlay(track)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, track) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '30px 1fr 1fr 80px 60px 50px 50px',
        padding: '10px 14px', cursor: 'pointer', alignItems: 'center',
        borderBottom: `1px solid ${T.border}`,
        background: isActive ? T.activeRow : hover ? T.hoverRow : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 10, color: isActive ? T.accent : T.textMuted }}>
        {isActive && isPlaying ? '▶' : index + 1}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <AlbumArt color={track.color} size={32} trackId={track.id} artworkPath={track.artwork_path}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? T.accent : T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {track.title}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted }}>{track.artist}</div>
        </div>
      </div>
      <span style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.album}</span>
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.08em' }}>{track.genre}</span>
      <span style={{ fontSize: 10, color: T.textMuted }}>{track.plays || 0}</span>
      <span style={{ fontSize: 10, color: T.textMuted }}>{formatTime(track.duration)}</span>
      <button onClick={e => { e.stopPropagation(); onToggleFav(track.id) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: track.favorite ? T.accent : T.textMuted, padding: 0 }}>
        {track.favorite ? '♥' : '♡'}
      </button>
    </div>
  )
})

// ── Library View ──────────────────────────────────────────────────────────────
export function LibraryView({ theme: T, section }) {
  const { state, filteredTracks, toggleFavorite, setSort, addTrackToPlaylist, loadPlaylists } = useLibrary()
  const { state: playerState, playTrack, addToQueue } = usePlayer()
  const [sortCol, setSortCol] = useState('title')
  const [sortDir, setSortDir] = useState('asc')
  const [ctxMenu, setCtxMenu] = useState(null)  // { x, y, track }

  const handleSort = (col) => {
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc'
    setSortCol(col); setSortDir(newDir); setSort(col, newDir)
  }

  const displayTracks = (() => {
    switch (section) {
      case 'favorites': return filteredTracks.filter(t => t.favorite)
      case 'recent':    return [...filteredTracks].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 50)
      default:          return filteredTracks
    }
  })()

  const handlePlay = useCallback((track) => { playTrack(track, displayTracks) }, [displayTracks, playTrack])

  const handleContextMenu = useCallback((e, track) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, track })
  }, [])

  const handleAddToPlaylist = useCallback(async (playlistId) => {
    if (!ctxMenu?.track) return
    await addTrackToPlaylist(playlistId, ctxMenu.track.id)
  }, [ctxMenu, addTrackToPlaylist])

  const totalDur = displayTracks.reduce((a, t) => a + (t.duration || 0), 0)
  const sectionTitle = { library: 'MUSIC LIBRARY', favorites: 'FAVORITES', recent: 'RECENTLY PLAYED' }[section] || 'MUSIC LIBRARY'

  const SortHeader = ({ col, label }) => (
    <span onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </span>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 10px' }}>
      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          track={ctxMenu.track}
          playlists={state.playlists}
          onClose={() => setCtxMenu(null)}
          onPlay={() => handlePlay(ctxMenu.track)}
          onAddToQueue={() => addToQueue(ctxMenu.track)}
          onToggleFav={() => toggleFavorite(ctxMenu.track.id)}
          onAddToPlaylist={handleAddToPlaylist}
          onShowInFolder={() => window.electronAPI?.system.showItemInFolder(ctxMenu.track.file_path)}
          theme={T}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>{sectionTitle}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
            {displayTracks.length} TRACKS · {formatTotalDuration(totalDur)}
          </p>
        </div>
        <HWButton size="sm" theme={T} onClick={() => displayTracks[0] && playTrack(displayTracks[0], displayTracks)}>
          ▶ PLAY ALL
        </HWButton>
      </div>

      {displayTracks.length > 0 ? (
        <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: T.neumorphIn, background: T.surfaceDeep }}>
          <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 80px 60px 50px 50px', padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 9, letterSpacing: '0.15em', color: T.textMuted }}>
            <span>#</span>
            <SortHeader col="title" label="TITLE"/>
            <SortHeader col="album" label="ALBUM"/>
            <SortHeader col="genre" label="GENRE"/>
            <SortHeader col="plays" label="PLAYS"/>
            <SortHeader col="duration" label="TIME"/>
            <span>♥</span>
          </div>
          {displayTracks.map((track, idx) => (
            <TrackRow
              key={track.id || track.file_path}
              track={track} index={idx}
              isActive={playerState.currentTrack?.id === track.id}
              isPlaying={playerState.isPlaying}
              onPlay={handlePlay}
              onToggleFav={toggleFavorite}
              onContextMenu={handleContextMenu}
              theme={T}
            />
          ))}
        </div>
      ) : (
        <EmptyState theme={T} section={section}/>
      )}
    </div>
  )
}

// ── Albums Grid ───────────────────────────────────────────────────────────────
export function AlbumsView({ theme: T }) {
  const { state } = useLibrary()
  const { playTrack } = usePlayer()
  const albums = state.albums

  const handleAlbumPlay = useCallback(async (album) => {
    if (!window.electronAPI) return
    const tracks = await window.electronAPI.library.getTracksByAlbum(album.title, album.artist)
    if (tracks && tracks.length > 0) playTrack(tracks[0], tracks)
  }, [playTrack])

  if (!albums.length) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, letterSpacing: '0.15em', color: T.text }}>ALBUMS</h2>
        <EmptyState theme={T} section="albums"/>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 10px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>ALBUMS</h2>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>{albums.length} ALBUMS</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {albums.map((album, i) => (
          <AlbumCard key={`${album.title}-${album.artist}`} album={album} index={i} theme={T} onClick={() => handleAlbumPlay(album)}/>
        ))}
      </div>
    </div>
  )
}

const AlbumCard = memo(function AlbumCard({ album, index, theme: T, onClick }) {
  const [hover, setHover] = useState(false)
  const color = album.color || '#e8834a'
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 12, padding: 14, cursor: 'pointer', background: T.surfaceRaised,
        boxShadow: hover ? `${T.neumorphOut}, 0 0 0 1px ${color}44` : T.neumorphOut,
        border: `1px solid ${hover ? color + '44' : T.border}`,
        transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 8,
        transform: hover ? 'translateY(-2px)' : 'none',
      }}>
      <div style={{ borderRadius: 8, overflow: 'hidden', boxShadow: T.neumorphIn }}>
        <AlbumArt color={color} size={132} trackId={index + 1} artworkPath={album.artwork_path}/>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: T.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.title}</div>
        <div style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.artist}</div>
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>{album.year} · {album.track_count || album.tracks || 0} tracks</div>
      </div>
    </div>
  )
})

// ── Artists View ──────────────────────────────────────────────────────────────
export function ArtistsView({ theme: T }) {
  const { state } = useLibrary()
  const { playTrack } = usePlayer()
  const artists = state.artists

  const handleArtistPlay = useCallback(async (artist) => {
    if (!window.electronAPI) return
    const tracks = await window.electronAPI.library.getTracksByArtist(artist.name)
    if (tracks && tracks.length > 0) playTrack(tracks[0], tracks)
  }, [playTrack])

  if (!artists.length) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, letterSpacing: '0.15em', color: T.text }}>ARTISTS</h2>
        <EmptyState theme={T} section="artists"/>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 10px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>ARTISTS</h2>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>{artists.length} ARTISTS</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {artists.map(artist => (
          <div key={artist.name}
            onClick={() => handleArtistPlay(artist)}
            style={{ borderRadius: 10, padding: 16, cursor: 'pointer', background: T.surfaceRaised, boxShadow: T.neumorphOut, border: `1px solid ${T.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: `radial-gradient(circle, ${T.accent}44, ${T.surfaceDeep})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: T.neumorphIn }}>
              {artist.name[0]?.toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist.name}</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{artist.album_count} albums · {artist.track_count} tracks</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ theme: T, section }) {
  const { addLibraryPath, scanLibrary, importFiles, state } = useLibrary()
  const message = section === 'favorites'
    ? 'No favorites yet. Click ♡ on any track.'
    : 'Your library is empty. Add a folder or import files to get started.'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 16 }}>
      <div style={{ fontSize: 48, opacity: 0.2 }}>♫</div>
      <div style={{ fontSize: 14, color: T.textMuted, textAlign: 'center' }}>{message}</div>
      {section !== 'favorites' && section !== 'artists' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <HWButton theme={T} onClick={addLibraryPath}>+ ADD FOLDER</HWButton>
          <HWButton theme={T} onClick={() => importFiles()}>⇩ IMPORT FILES</HWButton>
          {state.libraryPaths?.length > 0 && (
            <HWButton theme={T} onClick={() => scanLibrary()}>⟳ SCAN LIBRARY</HWButton>
          )}
        </div>
      )}
    </div>
  )
}
