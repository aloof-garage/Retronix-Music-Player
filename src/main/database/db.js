'use strict'

const Database = require('better-sqlite3')
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

  db = new Database(dbPath, { verbose: process.env.NODE_ENV === 'development' ? console.log : undefined })

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = 10000')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456') // 256MB

  runMigrations()
  return db
}

function runMigrations() {
  db.exec(`
    -- ── TRACKS TABLE ──────────────────────────────────────────────────────────
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

    -- ── ALBUMS TABLE ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS albums (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      artist       TEXT NOT NULL,
      album_artist TEXT,
      year         INTEGER,
      genre        TEXT,
      artwork_path TEXT,
      artwork_hash TEXT,
      color        TEXT,
      UNIQUE(title, artist)
    );

    -- ── ARTISTS TABLE ────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS artists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE NOT NULL,
      image_path TEXT,
      bio        TEXT
    );

    -- ── PLAYLISTS TABLE ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS playlists (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      description  TEXT,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      is_smart     INTEGER NOT NULL DEFAULT 0,
      smart_rules  TEXT,
      cover_path   TEXT,
      color        TEXT
    );

    -- ── PLAYLIST TRACKS TABLE ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position    INTEGER NOT NULL DEFAULT 0,
      added_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(playlist_id, track_id)
    );

    -- ── PLAY HISTORY TABLE ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS play_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      played_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      duration   REAL,
      completed  INTEGER DEFAULT 0
    );

    -- ── LIBRARY PATHS TABLE ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS library_paths (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      path      TEXT UNIQUE NOT NULL,
      enabled   INTEGER NOT NULL DEFAULT 1,
      added_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      last_scan INTEGER
    );

    -- ── SCAN LOG TABLE ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS scan_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      ended_at   INTEGER,
      tracks_added   INTEGER DEFAULT 0,
      tracks_updated INTEGER DEFAULT 0,
      tracks_removed INTEGER DEFAULT 0,
      errors     TEXT
    );

    -- ── ARTWORK CACHE TABLE ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS artwork_cache (
      hash       TEXT PRIMARY KEY,
      file_path  TEXT NOT NULL,
      width      INTEGER,
      height     INTEGER,
      format     TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- ── INDICES ──────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_tracks_artist    ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album     ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_genre     ON tracks(genre);
    CREATE INDEX IF NOT EXISTS idx_tracks_year      ON tracks(year);
    CREATE INDEX IF NOT EXISTS idx_tracks_title     ON tracks(title);
    CREATE INDEX IF NOT EXISTS idx_tracks_favorite  ON tracks(favorite);
    CREATE INDEX IF NOT EXISTS idx_tracks_plays     ON tracks(plays);
    CREATE INDEX IF NOT EXISTS idx_tracks_added     ON tracks(date_added);
    CREATE INDEX IF NOT EXISTS idx_tracks_filepath  ON tracks(file_path);
    CREATE INDEX IF NOT EXISTS idx_pt_playlist      ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_pt_track         ON playlist_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_history_track    ON play_history(track_id);
    CREATE INDEX IF NOT EXISTS idx_history_played   ON play_history(played_at);
  `)

  console.log('[DB] Schema migrations complete')
}

// ── TRACK QUERIES ─────────────────────────────────────────────────────────────

const queries = {
  // Tracks
  getAllTracks: () => db.prepare(`
    SELECT t.*, 
           GROUP_CONCAT(DISTINCT pt.playlist_id) as playlist_ids
    FROM tracks t
    LEFT JOIN playlist_tracks pt ON t.id = pt.track_id
    GROUP BY t.id
    ORDER BY t.title ASC
  `).all(),

  getTrackById: (id) => db.prepare('SELECT * FROM tracks WHERE id = ?').get(id),

  getTrackByPath: (filePath) => db.prepare('SELECT * FROM tracks WHERE file_path = ?').get(filePath),

  searchTracks: (query, limit = 200) => {
    const q = `%${query}%`
    return db.prepare(`
      SELECT * FROM tracks 
      WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR genre LIKE ?
      ORDER BY title ASC LIMIT ?
    `).all(q, q, q, q, limit)
  },

  getTracksByArtist: (artist) => db.prepare(
    'SELECT * FROM tracks WHERE artist = ? ORDER BY album, track_number, title'
  ).all(artist),

  getTracksByAlbum: (album, artist) => db.prepare(
    'SELECT * FROM tracks WHERE album = ? AND artist = ? ORDER BY track_number, title'
  ).all(album, artist),

  getFavoriteTracks: () => db.prepare(
    'SELECT * FROM tracks WHERE favorite = 1 ORDER BY title ASC'
  ).all(),

  getRecentlyPlayed: (limit = 50) => db.prepare(`
    SELECT DISTINCT t.* FROM tracks t
    INNER JOIN play_history ph ON t.id = ph.track_id
    ORDER BY ph.played_at DESC LIMIT ?
  `).all(limit),

  getMostPlayed: (limit = 50) => db.prepare(
    'SELECT * FROM tracks ORDER BY plays DESC LIMIT ?'
  ).all(limit),

  upsertTrack: db.transaction((track) => {
    const existing = db.prepare('SELECT id, plays, favorite from tracks WHERE file_path = ?').get(track.file_path)
    if (existing) {
      db.prepare(`
        UPDATE tracks SET
          title=?, artist=?, album=?, album_artist=?, genre=?, year=?,
          track_number=?, disc_number=?, duration=?, bitrate=?, sample_rate=?,
          channels=?, codec=?, file_size=?, last_modified=?, artwork_path=?,
          artwork_hash=?, color=?, bpm=?, comment=?
        WHERE file_path=?
      `).run(
        track.title, track.artist, track.album, track.album_artist, track.genre,
        track.year, track.track_number, track.disc_number, track.duration,
        track.bitrate, track.sample_rate, track.channels, track.codec,
        track.file_size, track.last_modified, track.artwork_path,
        track.artwork_hash, track.color, track.bpm, track.comment,
        track.file_path
      )
      return { id: existing.id, updated: true }
    } else {
      const result = db.prepare(`
        INSERT INTO tracks (
          file_path, title, artist, album, album_artist, genre, year,
          track_number, disc_number, duration, bitrate, sample_rate,
          channels, codec, file_size, last_modified, artwork_path,
          artwork_hash, color, bpm, comment
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        track.file_path, track.title, track.artist, track.album, track.album_artist,
        track.genre, track.year, track.track_number, track.disc_number,
        track.duration, track.bitrate, track.sample_rate, track.channels,
        track.codec, track.file_size, track.last_modified, track.artwork_path,
        track.artwork_hash, track.color, track.bpm, track.comment
      )
      return { id: result.lastInsertRowid, updated: false }
    }
  }),

  updateTrackPlays: (id) => {
    db.prepare('UPDATE tracks SET plays = plays + 1, last_played = ? WHERE id = ?')
      .run(Date.now(), id)
    db.prepare('INSERT INTO play_history (track_id, played_at) VALUES (?, ?)').run(id, Date.now())
  },

  toggleFavorite: (id) => db.prepare(
    'UPDATE tracks SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?'
  ).run(id),

  removeTrack: (filePath) => db.prepare('DELETE FROM tracks WHERE file_path = ?').run(filePath),

  // Albums
  getAllAlbums: () => db.prepare(`
    SELECT album as title, artist, album_artist, 
           MIN(year) as year, COUNT(*) as track_count,
           SUM(duration) as total_duration,
           MAX(artwork_path) as artwork_path, MAX(color) as color
    FROM tracks 
    GROUP BY album, artist
    ORDER BY artist, year
  `).all(),

  // Artists
  getAllArtists: () => db.prepare(`
    SELECT artist as name, 
           COUNT(DISTINCT album) as album_count,
           COUNT(*) as track_count,
           SUM(duration) as total_duration
    FROM tracks 
    GROUP BY artist
    ORDER BY artist ASC
  `).all(),

  // Playlists
  getAllPlaylists: () => db.prepare('SELECT * FROM playlists ORDER BY name ASC').all(),

  getPlaylistById: (id) => db.prepare('SELECT * FROM playlists WHERE id = ?').get(id),

  getPlaylistTracks: (playlistId) => db.prepare(`
    SELECT t.*, pt.position, pt.added_at as added_to_playlist
    FROM tracks t
    INNER JOIN playlist_tracks pt ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(playlistId),

  createPlaylist: (name, description = '', color = null) => {
    const result = db.prepare(
      'INSERT INTO playlists (name, description, color) VALUES (?, ?, ?)'
    ).run(name, description, color)
    return result.lastInsertRowid
  },

  updatePlaylist: (id, name, description) => db.prepare(
    'UPDATE playlists SET name=?, description=?, updated_at=strftime(\'%s\',\'now\') WHERE id=?'
  ).run(name, description, id),

  deletePlaylist: (id) => db.prepare('DELETE FROM playlists WHERE id = ?').run(id),

  addTrackToPlaylist: (playlistId, trackId) => {
    const maxPos = db.prepare(
      'SELECT MAX(position) as pos FROM playlist_tracks WHERE playlist_id = ?'
    ).get(playlistId)
    const position = (maxPos?.pos ?? -1) + 1
    try {
      db.prepare(
        'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,?)'
      ).run(playlistId, trackId, position)
    } catch (e) { /* ignore duplicate */ }
  },

  removeTrackFromPlaylist: (playlistId, trackId) => db.prepare(
    'DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?'
  ).run(playlistId, trackId),

  reorderPlaylistTracks: db.transaction((playlistId, trackIds) => {
    const stmt = db.prepare(
      'UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?'
    )
    trackIds.forEach((id, idx) => stmt.run(idx, playlistId, id))
  }),

  // Library paths
  getLibraryPaths: () => db.prepare('SELECT * FROM library_paths WHERE enabled=1').all(),

  addLibraryPath: (dirPath) => {
    try {
      db.prepare('INSERT OR IGNORE INTO library_paths (path) VALUES (?)').run(dirPath)
    } catch (e) { /* ignore */ }
  },

  removeLibraryPath: (dirPath) => db.prepare('DELETE FROM library_paths WHERE path=?').run(dirPath),

  updateLibraryPathScan: (dirPath) => db.prepare(
    'UPDATE library_paths SET last_scan=strftime(\'%s\',\'now\') WHERE path=?'
  ).run(dirPath),

  // Stats
  getLibraryStats: () => db.prepare(`
    SELECT 
      COUNT(*) as total_tracks,
      COUNT(DISTINCT artist) as total_artists,
      COUNT(DISTINCT album) as total_albums,
      SUM(duration) as total_duration,
      SUM(file_size) as total_size,
      COUNT(CASE WHEN favorite=1 THEN 1 END) as favorite_count
    FROM tracks
  `).get(),

  // Artwork cache
  getArtwork: (hash) => db.prepare('SELECT * FROM artwork_cache WHERE hash=?').get(hash),

  cacheArtwork: (hash, filePath, width, height, format) => {
    try {
      db.prepare(
        'INSERT OR REPLACE INTO artwork_cache (hash, file_path, width, height, format) VALUES (?,?,?,?,?)'
      ).run(hash, filePath, width, height, format)
    } catch (e) { /* ignore */ }
  }
}

function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

module.exports = { initDatabase, getDb, queries }
