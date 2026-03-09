import { useState, useCallback, memo, useRef } from 'react'
import { AlbumArt, HWButton } from './UIComponents'
import { formatTime, formatTotalDuration } from '../utils/helpers'
import { usePlayer } from '../store/PlayerStore'
import { useLibrary } from '../store/LibraryStore'

// ── Track Row (memoized for performance) ──────────────────────────────────────
const TrackRow = memo(function TrackRow({ track, index, isActive, isPlaying, onPlay, onToggleFav, theme: T }) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onDoubleClick={() => onPlay(track)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '30px 1fr 1fr 80px 60px 50px 50px',
        padding: '10px 14px', cursor: 'pointer', alignItems: 'center',
        borderBottom: `1px solid ${T.border}`,
        background: isActive
          ? T.activeRow
          : hover ? T.hoverRow : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 10, color: isActive ? T.accent : T.textMuted }}>
        {isActive && isPlaying ? '▶' : index + 1}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <AlbumArt color={track.color} size={32} trackId={track.id} artworkPath={track.artwork_path}/>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: isActive ? 700 : 400,
            color: isActive ? T.accent : T.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{track.title}</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>{track.artist}</div>
        </div>
      </div>
      <span style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {track.album}
      </span>
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.08em' }}>{track.genre}</span>
      <span style={{ fontSize: 10, color: T.textMuted }}>{track.plays || 0}</span>
      <span style={{ fontSize: 10, color: T.textMuted }}>{formatTime(track.duration)}</span>
      <button
        onClick={e => { e.stopPropagation(); onToggleFav(track.id) }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
          color: track.favorite ? T.accent : T.textMuted, padding: 0,
        }}
      >
        {track.favorite ? '♥' : '♡'}
      </button>
    </div>
  )
})

// ── Library View ──────────────────────────────────────────────────────────────
export function LibraryView({ theme: T, section }) {
  const { state, filteredTracks, toggleFavorite, setSort } = useLibrary()
  const { state: playerState, playTrack } = usePlayer()
  const [sortCol, setSortCol] = useState('title')
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (col) => {
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc'
    setSortCol(col)
    setSortDir(newDir)
    setSort(col, newDir)
  }

  const displayTracks = (() => {
    switch (section) {
      case 'favorites': return filteredTracks.filter(t => t.favorite)
      case 'recent':    return [...filteredTracks].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 50)
      default:          return filteredTracks
    }
  })()

  const handlePlay = useCallback((track) => {
    playTrack(track, displayTracks)
  }, [displayTracks, playTrack])

  const totalDur = displayTracks.reduce((a, t) => a + (t.duration || 0), 0)

  const sectionTitle = {
    library:   'MUSIC LIBRARY',
    favorites: 'FAVORITES',
    recent:    'RECENTLY PLAYED',
    artists:   'ARTISTS',
    playlists: 'PLAYLISTS',
  }[section] || 'MUSIC LIBRARY'

  const SortHeader = ({ col, label, style = {} }) => (
    <span
      onClick={() => handleSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', ...style }}
    >
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </span>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 10px' }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>
            {sectionTitle}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
            {displayTracks.length} TRACKS · {formatTotalDuration(totalDur)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <HWButton size="sm" theme={T} onClick={() => playTrack(displayTracks[0], displayTracks)}>
            ▶ PLAY ALL
          </HWButton>
        </div>
      </div>

      {/* Table */}
      {displayTracks.length > 0 ? (
        <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: T.neumorphIn, background: T.surfaceDeep }}>
          {/* Headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '30px 1fr 1fr 80px 60px 50px 50px',
            padding: '8px 14px', borderBottom: `1px solid ${T.border}`,
            fontSize: 9, letterSpacing: '0.15em', color: T.textMuted,
          }}>
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
              track={track}
              index={idx}
              isActive={playerState.currentTrack?.id === track.id}
              isPlaying={playerState.isPlaying}
              onPlay={handlePlay}
              onToggleFav={toggleFavorite}
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
export function AlbumsView({ theme: T, onAlbumSelect }) {
  const { state } = useLibrary()
  const albums = state.albums.length > 0 ? state.albums : getMockAlbums()

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 10px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.15em', color: T.text }}>ALBUMS</h2>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
          {albums.length} ALBUMS
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {albums.map((album, i) => (
          <AlbumCard key={`${album.title}-${album.artist}`} album={album} index={i} theme={T} onClick={() => onAlbumSelect?.(album)}/>
        ))}
      </div>
    </div>
  )
}

const AlbumCard = memo(function AlbumCard({ album, index, theme: T, onClick }) {
  const [hover, setHover] = useState(false)
  const color = album.color || '#e8834a'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 12, padding: 14, cursor: 'pointer', background: T.surfaceRaised,
        boxShadow: hover
          ? `${T.neumorphOut}, 0 0 0 1px ${color}44`
          : T.neumorphOut,
        border: `1px solid ${hover ? color + '44' : T.border}`,
        transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 8,
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ borderRadius: 8, overflow: 'hidden', boxShadow: T.neumorphIn }}>
        <AlbumArt color={color} size={132} trackId={index + 1} artworkPath={album.artwork_path}/>
      </div>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: T.text, marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{album.title}</div>
        <div style={{
          fontSize: 10, color: T.textMuted, letterSpacing: '0.08em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{album.artist}</div>
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>
          {album.year} · {album.track_count || album.tracks} tracks
        </div>
      </div>
    </div>
  )
})

// ── Artists View ──────────────────────────────────────────────────────────────
export function ArtistsView({ theme: T, onArtistSelect }) {
  const { state } = useLibrary()
  const artists = state.artists

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
        <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, letterSpacing: '0.1em' }}>
          {artists.length} ARTISTS
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {artists.map(artist => (
          <div
            key={artist.name}
            onClick={() => onArtistSelect?.(artist)}
            style={{
              borderRadius: 10, padding: 16, cursor: 'pointer', background: T.surfaceRaised,
              boxShadow: T.neumorphOut, border: `1px solid ${T.border}`,
              display: 'flex', gap: 12, alignItems: 'center',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: `radial-gradient(circle, ${T.accent}44, ${T.surfaceDeep})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, boxShadow: T.neumorphIn,
            }}>
              {artist.name[0]?.toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: '0.05em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{artist.name}</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                {artist.album_count} albums · {artist.track_count} tracks
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ theme: T, section }) {
  const { addLibraryPath, scanLibrary, state } = useLibrary()

  const message = section === 'favorites'
    ? 'No favorites yet. Click ♡ on any track to add it here.'
    : 'Your library is empty. Add a folder to get started.'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 60, gap: 16,
    }}>
      <div style={{ fontSize: 48, opacity: 0.2 }}>♫</div>
      <div style={{ fontSize: 14, color: T.textMuted, textAlign: 'center', letterSpacing: '0.05em' }}>
        {message}
      </div>
      {section !== 'favorites' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <HWButton theme={T} onClick={addLibraryPath}>+ ADD FOLDER</HWButton>
          {state.libraryPaths?.length > 0 && (
            <HWButton theme={T} onClick={() => scanLibrary()}>⟳ SCAN LIBRARY</HWButton>
          )}
        </div>
      )}
    </div>
  )
}

// ── Mock albums for preview ───────────────────────────────────────────────────
function getMockAlbums() {
  return [
    { title: 'Circuits & Smoke', artist: 'Neon Epoch', year: 2023, tracks: 10, color: '#e8834a' },
    { title: 'Magnetic Tape Vol. II', artist: 'The Waveforms', year: 2022, tracks: 8, color: '#6b8dd6' },
    { title: 'Frequency Garden', artist: 'Vera Lux', year: 2021, tracks: 12, color: '#7ed4a0' },
    { title: 'Subterranean', artist: 'Deep Frequency', year: 2023, tracks: 9, color: '#c478d4' },
    { title: 'Voltage Suite', artist: 'Neon Epoch', year: 2020, tracks: 11, color: '#e8834a' },
    { title: 'Resonant Forms', artist: 'The Waveforms', year: 2021, tracks: 7, color: '#6b8dd6' },
  ]
}
