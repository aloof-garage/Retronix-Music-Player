'use strict'

/**
 * Retronix Library Database
 *
 * Uses electron-store (pure JSON, zero native deps, zero WASM) instead of
 * SQLite. All reads are in-memory (fast). Writes flush to disk atomically.
 *
 * Data layout on disk  (userData/library.json):
 *   { tracks: [], playlists: [], playlistTracks: [], playHistory: [],
 *     libraryPaths: [], artworkCache: {}, nextIds: { track, playlist, pt, history } }
 */

const Store = require('electron-store')
const path  = require('path')

let store = null

// In-memory cache — loaded once on init, kept in sync on every write
let _db = {
  tracks:        [],
  playlists:     [],
  playlistTracks:[],
  playHistory:   [],
  libraryPaths:  [],
  artworkCache:  {},          // hash → filePath
  nextIds: { track: 1, playlist: 1, pt: 1, history: 1 },
}

function initDatabase() {
  store = new Store({
    name: 'library',
    defaults: {
      tracks:        [],
      playlists:     [],
      playlistTracks:[],
      playHistory:   [],
      libraryPaths:  [],
      artworkCache:  {},
      nextIds: { track: 1, playlist: 1, pt: 1, history: 1 },
    }
  })

  // Load everything into memory
  _db.tracks         = store.get('tracks',         [])
  _db.playlists      = store.get('playlists',      [])
  _db.playlistTracks = store.get('playlistTracks', [])
  _db.playHistory    = store.get('playHistory',    [])
  _db.libraryPaths   = store.get('libraryPaths',   [])
  _db.artworkCache   = store.get('artworkCache',   {})
  _db.nextIds        = store.get('nextIds',        { track: 1, playlist: 1, pt: 1, history: 1 })

  console.log(`[DB] Loaded: ${_db.tracks.length} tracks, ${_db.playlists.length} playlists`)
  return store
}

// ── Persist helpers ───────────────────────────────────────────────────────────
function _flush(key) { store.set(key, _db[key]) }
function _nextId(kind) { const id = _db.nextIds[kind]; _db.nextIds[kind]++; store.set('nextIds', _db.nextIds); return id }

// ── Public query API ──────────────────────────────────────────────────────────
const queries = {

  // ── Tracks ────────────────────────────────────────────────────────────────
  getAllTracks: () => {
    return [..._db.tracks].sort((a, b) => {
      const ca = (a.artist || '') + (a.album || '') + (String(a.track_number || 9999)).padStart(4, '0') + (a.title || '')
      const cb = (b.artist || '') + (b.album || '') + (String(b.track_number || 9999)).padStart(4, '0') + (b.title || '')
      return ca.localeCompare(cb)
    })
  },

  getTrackById: (id) => _db.tracks.find(t => t.id === Number(id)) || null,

  getTrackByPath: (filePath) => _db.tracks.find(t => t.file_path === filePath) || null,

  searchTracks: (query, limit = 500) => {
    const q = query.toLowerCase()
    return _db.tracks
      .filter(t =>
        (t.title  || '').toLowerCase().includes(q) ||
        (t.artist || '').toLowerCase().includes(q) ||
        (t.album  || '').toLowerCase().includes(q) ||
        (t.genre  || '').toLowerCase().includes(q)
      )
      .slice(0, limit)
  },

  getTracksByArtist: (artist) =>
    _db.tracks.filter(t => t.artist === artist)
      .sort((a, b) => (a.album || '').localeCompare(b.album || '') || (a.track_number || 0) - (b.track_number || 0)),

  getTracksByAlbum: (album, artist) =>
    _db.tracks.filter(t => t.album === album && t.artist === artist)
      .sort((a, b) => (a.disc_number || 0) - (b.disc_number || 0) || (a.track_number || 0) - (b.track_number || 0)),

  getFavoriteTracks: () =>
    _db.tracks.filter(t => t.favorite).sort((a, b) => (a.title || '').localeCompare(b.title || '')),

  getRecentlyPlayed: (limit = 50) => {
    const recent = [..._db.playHistory]
      .sort((a, b) => b.played_at - a.played_at)
    const seen = new Set()
    const ids = []
    for (const h of recent) {
      if (!seen.has(h.track_id)) { seen.add(h.track_id); ids.push(h.track_id) }
      if (ids.length >= limit) break
    }
    return ids.map(id => _db.tracks.find(t => t.id === id)).filter(Boolean)
  },

  getMostPlayed: (limit = 50) =>
    [..._db.tracks].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, limit),

  upsertTrack: (track) => {
    const idx = _db.tracks.findIndex(t => t.file_path === track.file_path)
    if (idx >= 0) {
      _db.tracks[idx] = { ..._db.tracks[idx], ...track }
      _flush('tracks')
      return { id: _db.tracks[idx].id, updated: true }
    }
    const id = _nextId('track')
    const newTrack = { ...track, id, plays: 0, favorite: false, date_added: Date.now() }
    _db.tracks.push(newTrack)
    _flush('tracks')
    return { id, updated: false }
  },

  // Bulk upsert used at end of scan for performance (one disk write)
  bulkUpsertTracks: (tracks) => {
    let added = 0, updated = 0
    for (const track of tracks) {
      const idx = _db.tracks.findIndex(t => t.file_path === track.file_path)
      if (idx >= 0) {
        _db.tracks[idx] = { ..._db.tracks[idx], ...track }
        updated++
      } else {
        const id = _nextId('track')
        _db.tracks.push({ ...track, id, plays: 0, favorite: false, date_added: Date.now() })
        added++
      }
    }
    _flush('tracks')
    return { added, updated }
  },

  updateTrackPlays: (id) => {
    const t = _db.tracks.find(t => t.id === Number(id))
    if (t) { t.plays = (t.plays || 0) + 1; t.last_played = Date.now(); _flush('tracks') }
    const hid = _nextId('history')
    _db.playHistory.push({ id: hid, track_id: Number(id), played_at: Date.now() })
    // Keep history capped at 5000
    if (_db.playHistory.length > 5000) _db.playHistory = _db.playHistory.slice(-5000)
    _flush('playHistory')
  },

  toggleFavorite: (id) => {
    const t = _db.tracks.find(t => t.id === Number(id))
    if (t) { t.favorite = !t.favorite; _flush('tracks'); return { favorite: t.favorite } }
    return null
  },

  removeTrack: (filePath) => {
    const before = _db.tracks.length
    _db.tracks = _db.tracks.filter(t => t.file_path !== filePath)
    if (_db.tracks.length !== before) _flush('tracks')
  },

  removeStaleTracks: (validPaths) => {
    const valid = new Set(validPaths)
    const before = _db.tracks.length
    _db.tracks = _db.tracks.filter(t => valid.has(t.file_path))
    if (_db.tracks.length !== before) _flush('tracks')
    return before - _db.tracks.length
  },

  // ── Albums & Artists ──────────────────────────────────────────────────────
  getAllAlbums: () => {
    const map = new Map()
    for (const t of _db.tracks) {
      const key = (t.album || '') + '|||' + (t.artist || '')
      if (!map.has(key)) {
        map.set(key, { title: t.album || 'Unknown Album', artist: t.artist || 'Unknown Artist',
          year: t.year, track_count: 0, total_duration: 0, artwork_path: t.artwork_path, color: t.color })
      }
      const a = map.get(key)
      a.track_count++
      a.total_duration += t.duration || 0
      if (!a.year && t.year) a.year = t.year
      if (!a.artwork_path && t.artwork_path) a.artwork_path = t.artwork_path
    }
    return [...map.values()].sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
  },

  getAllArtists: () => {
    const map = new Map()
    for (const t of _db.tracks) {
      const name = t.artist || 'Unknown Artist'
      if (!map.has(name)) map.set(name, { name, album_count: new Set(), track_count: 0, total_duration: 0 })
      const a = map.get(name)
      a.album_count.add(t.album || '')
      a.track_count++
      a.total_duration += t.duration || 0
    }
    return [...map.values()]
      .map(a => ({ ...a, album_count: a.album_count.size }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  getLibraryStats: () => {
    const artists = new Set(_db.tracks.map(t => t.artist))
    const albums  = new Set(_db.tracks.map(t => t.album))
    return {
      total_tracks:   _db.tracks.length,
      total_artists:  artists.size,
      total_albums:   albums.size,
      total_duration: _db.tracks.reduce((s, t) => s + (t.duration || 0), 0),
      total_size:     _db.tracks.reduce((s, t) => s + (t.file_size || 0), 0),
      favorite_count: _db.tracks.filter(t => t.favorite).length,
    }
  },

  // ── Playlists ─────────────────────────────────────────────────────────────
  getAllPlaylists: () => [..._db.playlists].sort((a, b) => (a.name || '').localeCompare(b.name || '')),

  getPlaylistById: (id) => _db.playlists.find(p => p.id === Number(id)) || null,

  getPlaylistTracks: (playlistId) => {
    const pid = Number(playlistId)
    const pts = _db.playlistTracks.filter(pt => pt.playlist_id === pid).sort((a, b) => a.position - b.position)
    return pts.map(pt => {
      const track = _db.tracks.find(t => t.id === pt.track_id)
      return track ? { ...track, position: pt.position, added_to_playlist: pt.added_at } : null
    }).filter(Boolean)
  },

  createPlaylist: (name, description, color) => {
    const id = _nextId('playlist')
    _db.playlists.push({ id, name: name || 'New Playlist', description: description || '',
      color: color || null, created_at: Date.now(), updated_at: Date.now() })
    _flush('playlists')
    return id
  },

  updatePlaylist: (id, name, description) => {
    const p = _db.playlists.find(p => p.id === Number(id))
    if (p) { p.name = name; p.description = description || ''; p.updated_at = Date.now(); _flush('playlists') }
  },

  deletePlaylist: (id) => {
    const pid = Number(id)
    _db.playlists      = _db.playlists.filter(p => p.id !== pid)
    _db.playlistTracks = _db.playlistTracks.filter(pt => pt.playlist_id !== pid)
    _flush('playlists'); _flush('playlistTracks')
  },

  addTrackToPlaylist: (playlistId, trackId) => {
    const pid = Number(playlistId), tid = Number(trackId)
    if (_db.playlistTracks.some(pt => pt.playlist_id === pid && pt.track_id === tid)) return
    const pts = _db.playlistTracks.filter(pt => pt.playlist_id === pid)
    const pos = pts.length > 0 ? Math.max(...pts.map(pt => pt.position)) + 1 : 0
    const id  = _nextId('pt')
    _db.playlistTracks.push({ id, playlist_id: pid, track_id: tid, position: pos, added_at: Date.now() })
    _flush('playlistTracks')
  },

  removeTrackFromPlaylist: (playlistId, trackId) => {
    const pid = Number(playlistId), tid = Number(trackId)
    _db.playlistTracks = _db.playlistTracks.filter(pt => !(pt.playlist_id === pid && pt.track_id === tid))
    _flush('playlistTracks')
  },

  reorderPlaylistTracks: (playlistId, trackIds) => {
    const pid = Number(playlistId)
    trackIds.forEach((tid, pos) => {
      const pt = _db.playlistTracks.find(pt => pt.playlist_id === pid && pt.track_id === Number(tid))
      if (pt) pt.position = pos
    })
    _flush('playlistTracks')
  },

  // ── Library Paths ─────────────────────────────────────────────────────────
  getLibraryPaths: () => _db.libraryPaths.filter(p => p.enabled),

  addLibraryPath: (dirPath) => {
    if (_db.libraryPaths.some(p => p.path === dirPath)) return
    _db.libraryPaths.push({ id: Date.now(), path: dirPath, enabled: true, added_at: Date.now(), last_scan: null })
    _flush('libraryPaths')
  },

  removeLibraryPath: (dirPath) => {
    _db.libraryPaths = _db.libraryPaths.filter(p => p.path !== dirPath)
    _flush('libraryPaths')
  },

  updateLibraryPathScan: (dirPath) => {
    const p = _db.libraryPaths.find(p => p.path === dirPath)
    if (p) { p.last_scan = Date.now(); _flush('libraryPaths') }
  },

  // ── Artwork Cache ─────────────────────────────────────────────────────────
  getArtwork: (hash) => {
    const fp = _db.artworkCache[hash]
    return fp ? { hash, file_path: fp } : null
  },

  cacheArtwork: (hash, filePath) => {
    _db.artworkCache[hash] = filePath
    _flush('artworkCache')
  },
}

function getDb() { return store }

module.exports = { initDatabase, getDb, queries }
