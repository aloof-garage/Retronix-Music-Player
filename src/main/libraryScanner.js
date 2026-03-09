'use strict'

const { glob } = require('glob')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const mm = require('music-metadata')
const { queries, getDb } = require('./database/db')

const SUPPORTED_FORMATS = [
  '**/*.mp3', '**/*.flac', '**/*.wav', '**/*.aac',
  '**/*.ogg', '**/*.m4a', '**/*.wma', '**/*.opus'
]

// Deterministic color from string
function colorFromString(str) {
  const colors = [
    '#e8834a', '#6b8dd6', '#7ed4a0', '#c478d4',
    '#d4a478', '#78c4d4', '#d478a4', '#a4d478',
    '#7a78d4', '#d4d478', '#78d4a4', '#d47878'
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

async function scanLibrary(libraryPaths, onProgress, onComplete, onError) {
  const scanId = Date.now()
  let added = 0, updated = 0, errors = 0

  console.log('[Scanner] Starting library scan for paths:', libraryPaths)

  try {
    const db = getDb()

    // Get all existing file paths for removal detection
    const existingPaths = new Set(
      db.prepare('SELECT file_path FROM tracks').all().map(r => r.file_path)
    )

    let allFiles = []
    for (const dir of libraryPaths) {
      if (!fs.existsSync(dir)) {
        console.warn('[Scanner] Path not found:', dir)
        continue
      }
      try {
        const patterns = SUPPORTED_FORMATS.map(p => path.join(dir, p).replace(/\\/g, '/'))
        const files = await glob(patterns, { absolute: true, nocase: true })
        allFiles = allFiles.concat(files)
      } catch (err) {
        console.error('[Scanner] Glob error for', dir, ':', err.message)
      }
    }

    // Remove duplicates
    allFiles = [...new Set(allFiles)]
    const total = allFiles.length
    console.log(`[Scanner] Found ${total} audio files`)

    onProgress?.({ phase: 'scanning', current: 0, total, message: `Found ${total} files` })

    const scannedPaths = new Set()

    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i]
      scannedPaths.add(filePath)

      if (i % 50 === 0) {
        onProgress?.({
          phase: 'processing',
          current: i,
          total,
          message: `Processing ${i}/${total} files...`,
          percent: Math.round((i / total) * 100)
        })
      }

      try {
        const stat = fs.statSync(filePath)
        const existing = queries.getTrackByPath(filePath)

        // Skip if file hasn't changed
        if (existing && existing.last_modified === Math.floor(stat.mtimeMs)) {
          continue
        }

        const track = await extractMetadata(filePath, stat)
        const result = queries.upsertTrack(track)
        if (result.updated) updated++
        else added++

      } catch (err) {
        errors++
        console.error('[Scanner] Error processing:', filePath, err.message)
      }
    }

    // Remove tracks for deleted files
    let removed = 0
    for (const existingPath of existingPaths) {
      if (!scannedPaths.has(existingPath)) {
        queries.removeTrack(existingPath)
        removed++
      }
    }

    // Update library path scan times
    for (const dir of libraryPaths) {
      queries.updateLibraryPathScan(dir)
    }

    const stats = { added, updated, removed, errors, total }
    console.log('[Scanner] Scan complete:', stats)
    onComplete?.(stats)
    return stats

  } catch (err) {
    console.error('[Scanner] Fatal error:', err)
    onError?.(err.message)
    throw err
  }
}

async function extractMetadata(filePath, stat) {
  let metadata = {}
  let artworkPath = null
  let artworkHash = null

  try {
    const parsed = await mm.parseFile(filePath, {
      duration: true,
      skipCovers: false,
      includeChapters: false
    })

    const tags = parsed.common || {}
    const format = parsed.format || {}

    // Extract embedded artwork
    if (tags.picture && tags.picture.length > 0) {
      const pic = tags.picture[0]
      const hash = crypto.createHash('md5').update(pic.data).digest('hex')
      artworkHash = hash

      const existing = queries.getArtwork(hash)
      if (existing) {
        artworkPath = existing.file_path
      } else {
        artworkPath = await saveArtwork(pic.data, hash, pic.format)
        if (artworkPath) {
          queries.cacheArtwork(hash, artworkPath, null, null, pic.format)
        }
      }
    }

    // Try folder artwork if no embedded
    if (!artworkPath) {
      artworkPath = findFolderArtwork(path.dirname(filePath))
    }

    metadata = {
      file_path: filePath,
      title: tags.title || path.basename(filePath, path.extname(filePath)),
      artist: tags.artist || tags.albumartist || 'Unknown Artist',
      album: tags.album || 'Unknown Album',
      album_artist: tags.albumartist || null,
      genre: Array.isArray(tags.genre) ? tags.genre[0] : (tags.genre || null),
      year: tags.year || null,
      track_number: tags.track?.no || null,
      disc_number: tags.disk?.no || null,
      duration: format.duration || 0,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      sample_rate: format.sampleRate || null,
      channels: format.numberOfChannels || null,
      codec: format.codec || path.extname(filePath).slice(1).toUpperCase(),
      file_size: stat.size,
      last_modified: Math.floor(stat.mtimeMs),
      artwork_path: artworkPath,
      artwork_hash: artworkHash,
      bpm: tags.bpm || null,
      comment: Array.isArray(tags.comment) ? tags.comment[0]?.text : (tags.comment || null),
      color: colorFromString(tags.album || tags.artist || filePath)
    }

  } catch (err) {
    // Fallback metadata from filename
    const basename = path.basename(filePath, path.extname(filePath))
    const parts = basename.split(' - ').map(s => s.trim())
    const artist = parts.length >= 2 ? parts[0] : 'Unknown Artist'
    const title = parts.length >= 2 ? parts.slice(1).join(' - ') : basename

    metadata = {
      file_path: filePath,
      title,
      artist,
      album: 'Unknown Album',
      album_artist: null,
      genre: null,
      year: null,
      track_number: null,
      disc_number: null,
      duration: 0,
      bitrate: null,
      sample_rate: null,
      channels: null,
      codec: path.extname(filePath).slice(1).toUpperCase(),
      file_size: stat.size,
      last_modified: Math.floor(stat.mtimeMs),
      artwork_path: findFolderArtwork(path.dirname(filePath)),
      artwork_hash: null,
      bpm: null,
      comment: null,
      color: colorFromString(artist)
    }
  }

  return metadata
}

async function saveArtwork(data, hash, format) {
  const { app } = require('electron')
  const artworkDir = path.join(app.getPath('userData'), 'artwork')
  if (!fs.existsSync(artworkDir)) {
    fs.mkdirSync(artworkDir, { recursive: true })
  }

  const ext = format?.includes('png') ? 'png' : 'jpg'
  const filePath = path.join(artworkDir, `${hash}.${ext}`)

  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, data)
    } catch (err) {
      console.error('[Scanner] Failed to save artwork:', err.message)
      return null
    }
  }

  return filePath
}

function findFolderArtwork(dir) {
  const artworkNames = [
    'cover.jpg', 'cover.png', 'album.jpg', 'album.png',
    'folder.jpg', 'folder.png', 'front.jpg', 'front.png',
    'artwork.jpg', 'artwork.png', 'AlbumArt.jpg', 'AlbumArtSmall.jpg'
  ]
  for (const name of artworkNames) {
    const fullPath = path.join(dir, name)
    if (fs.existsSync(fullPath)) return fullPath
  }
  return null
}

module.exports = { scanLibrary, extractMetadata }
