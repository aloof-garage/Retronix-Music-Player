import { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { colorFromString } from '../utils/helpers'

const MOCK_TRACKS = [
  { id: 1, title: 'Midnight Resonance', artist: 'Neon Epoch', album: 'Circuits & Smoke', genre: 'Synthwave', year: 2023, duration: 247, plays: 342, favorite: true, color: '#e8834a', file_path: null },
  { id: 2, title: 'Analog Dreams', artist: 'The Waveforms', album: 'Magnetic Tape Vol. II', genre: 'Ambient', year: 2022, duration: 312, plays: 189, favorite: false, color: '#6b8dd6', file_path: null },
  { id: 3, title: 'Static Horizon', artist: 'Neon Epoch', album: 'Circuits & Smoke', genre: 'Synthwave', year: 2023, duration: 198, plays: 521, favorite: true, color: '#e8834a', file_path: null },
  { id: 4, title: 'Oscillator Heart', artist: 'Vera Lux', album: 'Frequency Garden', genre: 'Electronic', year: 2021, duration: 276, plays: 88, favorite: false, color: '#7ed4a0', file_path: null },
  { id: 5, title: 'Cathode Bloom', artist: 'Deep Frequency', album: 'Subterranean', genre: 'Techno', year: 2023, duration: 389, plays: 210, favorite: false, color: '#c478d4', file_path: null },
  { id: 6, title: 'The Reel Turns', artist: 'Vera Lux', album: 'Frequency Garden', genre: 'Electronic', year: 2021, duration: 224, plays: 156, favorite: true, color: '#7ed4a0', file_path: null },
  { id: 7, title: 'Ferric Memory', artist: 'The Waveforms', album: 'Magnetic Tape Vol. II', genre: 'Ambient', year: 2022, duration: 445, plays: 67, favorite: false, color: '#6b8dd6', file_path: null },
  { id: 8, title: 'Phosphor Glow', artist: 'Deep Frequency', album: 'Subterranean', genre: 'Techno', year: 2023, duration: 301, plays: 298, favorite: false, color: '#c478d4', file_path: null },
  { id: 9, title: 'Copper Trace', artist: 'Neon Epoch', album: 'Voltage Suite', genre: 'Synthwave', year: 2020, duration: 267, plays: 412, favorite: true, color: '#e8834a', file_path: null },
  { id: 10, title: 'Signal Lost', artist: 'Vera Lux', album: 'Frequency Garden', genre: 'Electronic', year: 2021, duration: 193, plays: 331, favorite: false, color: '#7ed4a0', file_path: null },
  { id: 11, title: 'Warm Noise Floor', artist: 'Deep Frequency', album: 'Subterranean', genre: 'Techno', year: 2023, duration: 358, plays: 145, favorite: false, color: '#c478d4', file_path: null },
  { id: 12, title: 'Bias Tape Redux', artist: 'The Waveforms', album: 'Magnetic Tape Vol. II', genre: 'Ambient', year: 2022, duration: 512, plays: 44, favorite: true, color: '#6b8dd6', file_path: null },
]

const initialState = {
  tracks: MOCK_TRACKS,
  albums: [],
  artists: [],
  playlists: [],
  libraryPaths: [],
  stats: null,
  loading: false,
  scanning: false,
  scanProgress: null,
  searchQuery: '',
  sortBy: 'title',
  sortDir: 'asc',
  filterGenre: null,
  usingMockData: true,
}

function libraryReducer(state, action) {
  switch (action.type) {
    case 'SET_TRACKS':
      return { ...state, tracks: action.tracks, usingMockData: false }
    case 'SET_ALBUMS':
      return { ...state, albums: action.albums }
    case 'SET_ARTISTS':
      return { ...state, artists: action.artists }
    case 'SET_PLAYLISTS':
      return { ...state, playlists: action.playlists }
    case 'SET_PATHS':
      return { ...state, libraryPaths: action.paths }
    case 'SET_STATS':
      return { ...state, stats: action.stats }
    case 'SET_LOADING':
      return { ...state, loading: action.loading }
    case 'SET_SCANNING':
      return { ...state, scanning: action.scanning, scanProgress: action.scanning ? state.scanProgress : null }
    case 'SET_SCAN_PROGRESS':
      return { ...state, scanProgress: action.progress }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query }
    case 'SET_SORT':
      return { ...state, sortBy: action.sortBy, sortDir: action.sortDir }
    case 'TOGGLE_FAVORITE': {
      return {
        ...state,
        tracks: state.tracks.map(t =>
          t.id === action.id ? { ...t, favorite: !t.favorite } : t
        )
      }
    }
    case 'INCREMENT_PLAYS': {
      return {
        ...state,
        tracks: state.tracks.map(t =>
          t.id === action.id ? { ...t, plays: (t.plays || 0) + 1 } : t
        )
      }
    }
    case 'ADD_PLAYLIST':
      return { ...state, playlists: [...state.playlists, action.playlist] }
    case 'UPDATE_PLAYLIST':
      return {
        ...state,
        playlists: state.playlists.map(p => p.id === action.id ? { ...p, ...action.updates } : p)
      }
    case 'REMOVE_PLAYLIST':
      return { ...state, playlists: state.playlists.filter(p => p.id !== action.id) }
    default:
      return state
  }
}

const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [state, dispatch] = useReducer(libraryReducer, initialState)

  const api = window.electronAPI

  // ── Load from database on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!api) return
    loadLibrary()
    loadPlaylists()
    loadLibraryPaths()

    // Listen for scan events
    const unsubProgress = api.on('scan:progress', (progress) => {
      dispatch({ type: 'SET_SCAN_PROGRESS', progress })
    })
    const unsubComplete = api.on('scan:complete', () => {
      dispatch({ type: 'SET_SCANNING', scanning: false })
      loadLibrary()
    })
    const unsubStarted = api.on('scan:started', () => {
      dispatch({ type: 'SET_SCANNING', scanning: true })
    })

    return () => {
      unsubProgress?.()
      unsubComplete?.()
      unsubStarted?.()
    }
  }, [])

  const loadLibrary = useCallback(async () => {
    if (!api) return
    dispatch({ type: 'SET_LOADING', loading: true })
    try {
      const [tracks, albums, artists, stats] = await Promise.all([
        api.library.getAllTracks(),
        api.library.getAllAlbums(),
        api.library.getAllArtists(),
        api.library.getStats(),
      ])
      if (tracks?.length > 0) {
        dispatch({ type: 'SET_TRACKS', tracks: tracks.map(normalizeTrack) })
      }
      if (albums?.length > 0) dispatch({ type: 'SET_ALBUMS', albums })
      if (artists?.length > 0) dispatch({ type: 'SET_ARTISTS', artists })
      if (stats) dispatch({ type: 'SET_STATS', stats })
    } catch (err) {
      console.error('[Library] Load error:', err)
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }, [])

  const loadPlaylists = useCallback(async () => {
    if (!api) return
    const playlists = await api.playlist.getAll()
    if (playlists) dispatch({ type: 'SET_PLAYLISTS', playlists })
  }, [])

  const loadLibraryPaths = useCallback(async () => {
    if (!api) return
    const paths = await api.library.getPaths()
    if (paths) dispatch({ type: 'SET_PATHS', paths })
  }, [])

  const actions = {
    loadLibrary,
    loadPlaylists,

    search: useCallback(async (query) => {
      dispatch({ type: 'SET_SEARCH', query })
    }, []),

    setSort: useCallback((sortBy, sortDir) => {
      dispatch({ type: 'SET_SORT', sortBy, sortDir })
    }, []),

    toggleFavorite: useCallback(async (trackId) => {
      dispatch({ type: 'TOGGLE_FAVORITE', id: trackId })
      if (api) {
        await api.library.toggleFavorite(trackId)
      }
    }, []),

    incrementPlays: useCallback((trackId) => {
      dispatch({ type: 'INCREMENT_PLAYS', id: trackId })
    }, []),

    scanLibrary: useCallback(async (paths) => {
      if (!api) return
      dispatch({ type: 'SET_SCANNING', scanning: true })
      return api.library.scan(paths)
    }, []),

    addLibraryPath: useCallback(async () => {
      if (!api) return
      const dirs = await api.library.browse()
      if (!dirs) return
      for (const dir of dirs) {
        await api.library.addPath(dir)
      }
      loadLibraryPaths()
    }, [loadLibraryPaths]),

    removeLibraryPath: useCallback(async (dir) => {
      if (!api) return
      await api.library.removePath(dir)
      loadLibraryPaths()
    }, [loadLibraryPaths]),

    createPlaylist: useCallback(async (name, description, color) => {
      if (!api) return
      const id = await api.playlist.create(name, description, color)
      await loadPlaylists()
      return id
    }, [loadPlaylists]),

    deletePlaylist: useCallback(async (id) => {
      if (!api) return
      await api.playlist.delete(id)
      dispatch({ type: 'REMOVE_PLAYLIST', id })
    }, []),

    addTrackToPlaylist: useCallback(async (playlistId, trackId) => {
      if (!api) return
      await api.playlist.addTrack(playlistId, trackId)
    }, []),

    getPlaylistTracks: useCallback(async (playlistId) => {
      if (!api) return []
      return api.playlist.getTracks(playlistId)
    }, []),

    exportPlaylist: useCallback(async (id) => {
      if (!api) return
      return api.playlist.export(id)
    }, []),

    importPlaylist: useCallback(async () => {
      if (!api) return
      const result = await api.playlist.import()
      if (result) await loadPlaylists()
      return result
    }, [loadPlaylists]),

    openFiles: useCallback(async () => {
      if (!api) return
      return api.audio.openFile()
    }, []),
  }

  // Filtered + sorted tracks
  const filteredTracks = getFilteredTracks(state)

  return (
    <LibraryContext.Provider value={{ state, filteredTracks, ...actions }}>
      {children}
    </LibraryContext.Provider>
  )
}

function normalizeTrack(track) {
  return {
    ...track,
    color: track.color || colorFromString(track.album || track.artist || ''),
  }
}

function getFilteredTracks(state) {
  let tracks = state.tracks

  // Search filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase()
    tracks = tracks.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.artist || '').toLowerCase().includes(q) ||
      (t.album || '').toLowerCase().includes(q) ||
      (t.genre || '').toLowerCase().includes(q)
    )
  }

  // Genre filter
  if (state.filterGenre) {
    tracks = tracks.filter(t => t.genre === state.filterGenre)
  }

  // Sort
  const { sortBy, sortDir } = state
  tracks = [...tracks].sort((a, b) => {
    let aVal = a[sortBy] ?? ''
    let bVal = b[sortBy] ?? ''
    if (typeof aVal === 'string') aVal = aVal.toLowerCase()
    if (typeof bVal === 'string') bVal = bVal.toLowerCase()
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  return tracks
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider')
  return ctx
}
