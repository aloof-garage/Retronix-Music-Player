import { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { colorFromString } from '../utils/helpers'

const initialState = {
  tracks:       [],
  albums:       [],
  artists:      [],
  playlists:    [],
  libraryPaths: [],
  stats:        null,
  loading:      false,
  scanning:     false,
  scanProgress: null,
  searchQuery:  '',
  sortBy:       'title',
  sortDir:      'asc',
  filterGenre:  null,
  usingMockData: false,
}

function libraryReducer(state, action) {
  switch (action.type) {
    case 'SET_TRACKS':      return { ...state, tracks: action.tracks, usingMockData: false }
    case 'SET_ALBUMS':      return { ...state, albums: action.albums }
    case 'SET_ARTISTS':     return { ...state, artists: action.artists }
    case 'SET_PLAYLISTS':   return { ...state, playlists: action.playlists }
    case 'SET_PATHS':       return { ...state, libraryPaths: action.paths }
    case 'SET_STATS':       return { ...state, stats: action.stats }
    case 'SET_LOADING':     return { ...state, loading: action.loading }
    case 'SET_SCANNING':    return { ...state, scanning: action.scanning, scanProgress: action.scanning ? state.scanProgress : null }
    case 'SET_SCAN_PROGRESS': return { ...state, scanProgress: action.progress }
    case 'SET_SEARCH':      return { ...state, searchQuery: action.query }
    case 'SET_SORT':        return { ...state, sortBy: action.sortBy, sortDir: action.sortDir }

    case 'TOGGLE_FAVORITE':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, favorite: !t.favorite } : t) }

    case 'INCREMENT_PLAYS':
      return { ...state, tracks: state.tracks.map(t => t.id === action.id ? { ...t, plays: (t.plays || 0) + 1 } : t) }

    case 'ADD_PLAYLIST':
      return { ...state, playlists: [...state.playlists, action.playlist] }

    case 'REMOVE_PLAYLIST':
      return { ...state, playlists: state.playlists.filter(p => p.id !== action.id) }

    default: return state
  }
}

const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [state, dispatch] = useReducer(libraryReducer, initialState)
  const api = window.electronAPI

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return
    loadLibrary()
    loadPlaylists()
    loadLibraryPaths()

    const unsubProgress = api.on('scan:progress', (progress) => {
      dispatch({ type: 'SET_SCAN_PROGRESS', progress })
    })
    const unsubComplete = api.on('scan:complete', (stats) => {
      console.log('[Library] Scan complete:', stats)
      dispatch({ type: 'SET_SCANNING', scanning: false })
      loadLibrary()
    })
    const unsubStarted = api.on('scan:started', () => {
      dispatch({ type: 'SET_SCANNING', scanning: true })
    })
    const unsubError = api.on('scan:error', (err) => {
      console.error('[Library] Scan error:', err)
      dispatch({ type: 'SET_SCANNING', scanning: false })
    })

    return () => {
      unsubProgress?.()
      unsubComplete?.()
      unsubStarted?.()
      unsubError?.()
    }
  }, [])

  // ── Data loaders ───────────────────────────────────────────────────────────
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
      if (Array.isArray(tracks)) {
        dispatch({ type: 'SET_TRACKS', tracks: tracks.map(normalizeTrack) })
      }
      if (Array.isArray(albums))  dispatch({ type: 'SET_ALBUMS',  albums })
      if (Array.isArray(artists)) dispatch({ type: 'SET_ARTISTS', artists })
      if (stats) dispatch({ type: 'SET_STATS', stats })
    } catch (err) {
      console.error('[Library] Load error:', err)
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }, [])

  const loadPlaylists = useCallback(async () => {
    if (!api) return
    try {
      const playlists = await api.playlist.getAll()
      if (Array.isArray(playlists)) dispatch({ type: 'SET_PLAYLISTS', playlists })
    } catch (err) { console.error('[Library] loadPlaylists error:', err) }
  }, [])

  const loadLibraryPaths = useCallback(async () => {
    if (!api) return
    try {
      const paths = await api.library.getPaths()
      if (Array.isArray(paths)) dispatch({ type: 'SET_PATHS', paths })
    } catch (err) { console.error('[Library] loadLibraryPaths error:', err) }
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────
  const actions = {
    loadLibrary,
    loadPlaylists,

    search: useCallback((query) => {
      dispatch({ type: 'SET_SEARCH', query })
    }, []),

    setSort: useCallback((sortBy, sortDir) => {
      dispatch({ type: 'SET_SORT', sortBy, sortDir })
    }, []),

    toggleFavorite: useCallback(async (trackId) => {
      dispatch({ type: 'TOGGLE_FAVORITE', id: trackId })
      if (api) await api.library.toggleFavorite(trackId).catch(() => {})
    }, []),

    incrementPlays: useCallback((trackId) => {
      dispatch({ type: 'INCREMENT_PLAYS', id: trackId })
    }, []),

    // ── Library scanning ────────────────────────────────────────────────────
    scanLibrary: useCallback(async (paths) => {
      if (!api) return
      dispatch({ type: 'SET_SCANNING', scanning: true })
      return api.library.scan(paths || null)
    }, []),

    // ── Add folder and immediately scan it ─────────────────────────────────
    addLibraryPath: useCallback(async () => {
      if (!api) return
      const dirs = await api.library.browse()
      if (!dirs || dirs.length === 0) return

      // Register each path
      for (const dir of dirs) {
        await api.library.addPath(dir)
      }
      await loadLibraryPaths()

      // Kick off a targeted scan of only the newly added folders
      dispatch({ type: 'SET_SCANNING', scanning: true })
      return api.library.scan(dirs)
    }, [loadLibraryPaths]),

    removeLibraryPath: useCallback(async (dir) => {
      if (!api) return
      await api.library.removePath(dir)
      await loadLibraryPaths()
    }, [loadLibraryPaths]),

    // ── Import individual files ─────────────────────────────────────────────
    // If filePaths is null, opens the file-picker dialog first.
    importFiles: useCallback(async (filePaths) => {
      if (!api) return null

      let paths = filePaths
      if (!paths) {
        paths = await api.library.browseFiles()
      }
      if (!paths || paths.length === 0) return null

      const result = await api.library.importFiles(paths)
      console.log('[Library] importFiles result:', result)

      if (result && (result.added > 0 || result.updated > 0)) {
        await loadLibrary()
      }
      return result
    }, [loadLibrary]),

    // ── Playlists ───────────────────────────────────────────────────────────
    createPlaylist: useCallback(async (name, description, color) => {
      if (!api) return null
      const id = await api.playlist.create(name, description || '', color || null)
      await loadPlaylists()
      return id
    }, [loadPlaylists]),

    deletePlaylist: useCallback(async (id) => {
      if (!api) return
      await api.playlist.delete(id)
      dispatch({ type: 'REMOVE_PLAYLIST', id })
    }, []),

    addTrackToPlaylist: useCallback(async (playlistId, trackId) => {
      if (!api) return false
      return api.playlist.addTrack(playlistId, trackId)
    }, []),

    removeTrackFromPlaylist: useCallback(async (playlistId, trackId) => {
      if (!api) return false
      return api.playlist.removeTrack(playlistId, trackId)
    }, []),

    getPlaylistTracks: useCallback(async (playlistId) => {
      if (!api) return []
      return api.playlist.getTracks(playlistId)
    }, []),

    exportPlaylist: useCallback(async (id) => {
      if (!api) return null
      return api.playlist.export(id)
    }, []),

    importPlaylist: useCallback(async () => {
      if (!api) return null
      const result = await api.playlist.import()
      if (result) await loadPlaylists()
      return result
    }, [loadPlaylists]),
  }

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
    id:     Number(track.id),
    color:  track.color || colorFromString(track.album || track.artist || ''),
    plays:  Number(track.plays) || 0,
    favorite: Boolean(track.favorite),
  }
}

function getFilteredTracks(state) {
  let tracks = state.tracks

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase()
    tracks = tracks.filter(t =>
      (t.title  || '').toLowerCase().includes(q) ||
      (t.artist || '').toLowerCase().includes(q) ||
      (t.album  || '').toLowerCase().includes(q) ||
      (t.genre  || '').toLowerCase().includes(q)
    )
  }

  if (state.filterGenre) {
    tracks = tracks.filter(t => t.genre === state.filterGenre)
  }

  const { sortBy, sortDir } = state
  return [...tracks].sort((a, b) => {
    let av = a[sortBy] ?? '', bv = b[sortBy] ?? ''
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ?  1 : -1
    return 0
  })
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider')
  return ctx
}
