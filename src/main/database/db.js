'use strict'

const path = require('path')
const { app } = require('electron')
const fs = require('fs')

let db = null

function getDbPath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'library.db')
}

function initDatabase() {
  const dbPath = getDbPath()
  console.log('[DB] Opening database at:', dbPath)

  // node-sqlite3-wasm — pure WASM, no native compilation needed
  const { Database } = require('node-sqlite3-wasm')
  db = new Database(dbPath)

  // Performance pragmas
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA cache_size = 10000")
  db.exec("PRAGMA temp_store = MEMORY")

  runMigrations()
  console.log('[DB] Initialized successfully')
  return db
}

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path      TEXT UNIQUE NOT NULL,
      title          TEXT NOT NULL DEFAULT 'Unknown Title',
      artist         TEXT NOT NULL DEFAULT 'Unknown Artist',
      album          TEXT NOT NULL DEFAULT 'Unknown Album',
      album_artist   TEXT,
      genre          TEXT,
      year           INTEGER,
      track_number   INTEGER,
      disc_number    INTEGER,
      duration       REAL NOT NULL DEFAULT 0,
      bitrate        INTEGER,
      sample_rate    INTEGER,
      channels       INTEGER,
      codec          TEXT,
      file_size      INTEGER,
      last_modified  INTEGER,
      date_added     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      plays          INTEGER NOT NULL DEFAULT 0,
      last_played    INTEGER,
      favorite       INTEGER NOT NULL DEFAULT 0,
      rating         INTEGER DEFAULT 0,
      comment        TEXT,
      lyrics         TEXT,
      bpm            REAL,
      artwork_path   TEXT,
      artwork_hash   TEXT,
      color          TEXT
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      description  TEXT,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      cover_path   TEXT,
      color        TEXT
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position    INTEGER NOT NULL DEFAULT 0,
      added_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      played_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS library_paths (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      path      TEXT UNIQUE NOT NULL,
      enabled   INTEGER NOT NULL DEFAULT 1,
      added_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      last_scan INTEGER
    );

    CREATE TABLE IF NOT EXISTS artwork_cache (
      hash       TEXT PRIMARY KEY,
      file_path  TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_artist   ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album    ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_title    ON tracks(title);
    CREATE INDEX IF NOT EXISTS idx_tracks_favorite ON tracks(favorite);
    CREATE INDEX IF NOT EXISTS idx_tracks_plays    ON tracks(plays);
    CREATE INDEX IF NOT EXISTS idx_tracks_filepath ON tracks(file_path);
    CREATE INDEX IF NOT EXISTS idx_pt_playlist     ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_history_track   ON play_history(track_id);
  `)
  console.log('[DB] Schema ready')
}

// ── Helper to run a prepared statement safely ─────────────────────────────────
function run(sql, params = []) {
  const stmt = db.prepare(sql)
  const result = stmt.run(...params)
  stmt.finalize()
  return result
}

function get(sql, params = []) {
  const stmt = db.prepare(sql)
  const row = stmt.get(...params)
  stmt.finalize()
  return row
}

function all(sql, params = []) {
  const stmt = db.prepare(sql)
  const rows = stmt.all(...params)
  stmt.finalize()
  return rows
}

// ── Query API ─────────────────────────────────────────────────────────────────
const queries = {
  getAllTracks: () => all(`SELECT * FROM tracks ORDER BY title ASC`),

  getTrackById: (id) => get('SELECT * FROM tracks WHERE id = ?', [id]),

  getTrackByPath: (filePath) => get('SELECT * FROM tracks WHERE file_path = ?', [filePath]),

  searchTracks: (query, limit = 200) => {
    const q = `%${query}%`
    return all(
      `SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR genre LIKE ? ORDER BY title ASC LIMIT ?`,
      [q, q, q, q, limit]
    )
  },

  getTracksByArtist: (artist) => all(
    'SELECT * FROM tracks WHERE artist = ? ORDER BY album, track_number, title',
    [artist]
  ),

  getTracksByAlbum: (album, artist) => all(
    'SELECT * FROM tracks WHERE album = ? AND artist = ? ORDER BY track_number, title',
    [album, artist]
  ),

  getFavoriteTracks: () => all('SELECT * FROM tracks WHERE favorite = 1 ORDER BY title ASC'),

  getRecentlyPlayed: (limit = 50) => all(`
    SELECT DISTINCT t.* FROM tracks t
    INNER JOIN play_history ph ON t.id = ph.track_id
    ORDER BY ph.played_at DESC LIMIT ?
  `, [limit]),

  getMostPlayed: (limit = 50) => all(
    'SELECT * FROM tracks ORDER BY plays DESC LIMIT ?', [limit]
  ),

  upsertTrack: (track) => {
    const existing = get('SELECT id FROM tracks WHERE file_path = ?', [track.file_path])
    if (existing) {
      run(`UPDATE tracks SET
        title=?, artist=?, album=?, album_artist=?, genre=?, year=?,
        track_number=?, disc_number=?, duration=?, bitrate=?, sample_rate=?,
        channels=?, codec=?, file_size=?, last_modified=?, artwork_path=?,
        artwork_hash=?, color=?, bpm=?, comment=?
        WHERE file_path=?`,
        [track.title, track.artist, track.album, track.album_artist, track.genre,
         track.year, track.track_number, track.disc_number, track.duration,
         track.bitrate, track.sample_rate, track.channels, track.codec,
         track.file_size, track.last_modified, track.artwork_path,
         track.artwork_hash, track.color, track.bpm, track.comment,
         track.file_path]
      )
      return { id: existing.id, updated: true }
    } else {
      const result = run(`INSERT INTO tracks (
        file_path, title, artist, album, album_artist, genre, year,
        track_number, disc_number, duration, bitrate, sample_rate,
        channels, codec, file_size, last_modified, artwork_path,
        artwork_hash, color, bpm, comment
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [track.file_path, track.title, track.artist, track.album, track.album_artist,
         track.genre, track.year, track.track_number, track.disc_number,
         track.duration, track.bitrate, track.sample_rate, track.channels,
         track.codec, track.file_size, track.last_modified, track.artwork_path,
         track.artwork_hash, track.color, track.bpm, track.comment]
      )
      return { id: result.lastInsertRowid, updated: false }
    }
  },

  updateTrackPlays: (id) => {
    run('UPDATE tracks SET plays = plays + 1, last_played = ? WHERE id = ?', [Date.now(), id])
    run('INSERT INTO play_history (track_id, played_at) VALUES (?, ?)', [id, Date.now()])
  },

  toggleFavorite: (id) => run(
    'UPDATE tracks SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?', [id]
  ),

  removeTrack: (filePath) => run('DELETE FROM tracks WHERE file_path = ?', [filePath]),

  getAllAlbums: () => all(`
    SELECT album as title, artist, album_artist,
           MIN(year) as year, COUNT(*) as track_count,
           SUM(duration) as total_duration,
           MAX(artwork_path) as artwork_path, MAX(color) as color
    FROM tracks
    GROUP BY album, artist
    ORDER BY artist, year
  `),

  getAllArtists: () => all(`
    SELECT artist as name,
           COUNT(DISTINCT album) as album_count,
           COUNT(*) as track_count,
           SUM(duration) as total_duration
    FROM tracks
    GROUP BY artist
    ORDER BY artist ASC
  `),

  getAllPlaylists: () => all('SELECT * FROM playlists ORDER BY name ASC'),

  getPlaylistById: (id) => get('SELECT * FROM playlists WHERE id = ?', [id]),

  getPlaylistTracks: (playlistId) => all(`
    SELECT t.*, pt.position, pt.added_at as added_to_playlist
    FROM tracks t
    INNER JOIN playlist_tracks pt ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `, [playlistId]),

  createPlaylist: (name, description = '', color = null) => {
    const result = run(
      'INSERT INTO playlists (name, description, color) VALUES (?, ?, ?)',
      [name, description, color]
    )
    return result.lastInsertRowid
  },

  updatePlaylist: (id, name, description) => run(
    "UPDATE playlists SET name=?, description=?, updated_at=strftime('%s','now') WHERE id=?",
    [name, description, id]
  ),

  deletePlaylist: (id) => run('DELETE FROM playlists WHERE id = ?', [id]),

  addTrackToPlaylist: (playlistId, trackId) => {
    const maxPos = get(
      'SELECT MAX(position) as pos FROM playlist_tracks WHERE playlist_id = ?', [playlistId]
    )
    const position = (maxPos?.pos ?? -1) + 1
    try {
      run('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,?)',
        [playlistId, trackId, position])
    } catch (e) { /* ignore duplicate */ }
  },

  removeTrackFromPlaylist: (playlistId, trackId) => run(
    'DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?', [playlistId, trackId]
  ),

  reorderPlaylistTracks: (playlistId, trackIds) => {
    trackIds.forEach((id, idx) => {
      run('UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?',
        [idx, playlistId, id])
    })
  },

  getLibraryPaths: () => all('SELECT * FROM library_paths WHERE enabled=1'),

  addLibraryPath: (dirPath) => {
    try { run('INSERT OR IGNORE INTO library_paths (path) VALUES (?)', [dirPath]) } catch (e) {}
  },

  removeLibraryPath: (dirPath) => run('DELETE FROM library_paths WHERE path=?', [dirPath]),

  updateLibraryPathScan: (dirPath) => run(
    "UPDATE library_paths SET last_scan=strftime('%s','now') WHERE path=?", [dirPath]
  ),

  getLibraryStats: () => get(`
    SELECT
      COUNT(*) as total_tracks,
      COUNT(DISTINCT artist) as total_artists,
      COUNT(DISTINCT album) as total_albums,
      SUM(duration) as total_duration,
      SUM(file_size) as total_size,
      COUNT(CASE WHEN favorite=1 THEN 1 END) as favorite_count
    FROM tracks
  `),

  getArtwork: (hash) => get('SELECT * FROM artwork_cache WHERE hash=?', [hash]),

  cacheArtwork: (hash, filePath) => {
    try {
      run('INSERT OR REPLACE INTO artwork_cache (hash, file_path) VALUES (?,?)', [hash, filePath])
    } catch (e) {}
  }
}

function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

module.exports = { initDatabase, getDb, queries }
