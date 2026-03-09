'use strict'

const { glob } = require('glob')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { queries } = require('./database/db')

const SUPPORTED_EXTS = new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.wma', '.opus'])

function colorFromString(str) {
  const colors = ['#e8834a','#6b8dd6','#7ed4a0','#c478d4','#d4a478','#78c4d4','#d478a4','#a4d478']
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

async function scanLibrary(libraryPaths, onProgress, onComplete, onError) {
  let added = 0, updated = 0, errors = 0

  try {
    const existing = queries.getAllTracks()
    const existingPaths = new Set(existing.map(t => t.file_path))

    let allFiles = []
    for (const dir of libraryPaths) {
      if (!fs.existsSync(dir)) {
        console.warn('[Scanner] Directory not found:', dir)
        continue
      }
      try {
        // Normalize to forward slashes — glob requires this on Windows
        const normalizedDir = dir.replace(/\\/g, '/')

        const files = await glob('**/*', {
          cwd: normalizedDir,
          absolute: true,
          nodir: true,
          dot: false,
          follow: true,
        })

        // glob with absolute:true returns forward-slash paths; normalize for the OS
        const audio = files
          .map(f => path.normalize(f))
          .filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()))

        allFiles = allFiles.concat(audio)
        console.log(`[Scanner] ${dir}: found ${audio.length} audio files`)
      } catch (err) {
        console.error('[Scanner] Glob error in', dir, ':', err.message)
      }
    }

    allFiles = [...new Set(allFiles)]
    const total = allFiles.length
    console.log(`[Scanner] Total audio files to process: ${total}`)

    onProgress?.({ phase: 'scanning', current: 0, total, percent: 0, message: `Found ${total} files` })

    const scannedPaths = new Set()

    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i]
      scannedPaths.add(filePath)

      if (i % 20 === 0) {
        onProgress?.({
          phase: 'processing',
          current: i, total,
          percent: Math.round((i / total) * 100),
          message: `Processing ${i + 1} / ${total}…`
        })
        // Give IPC messages room to breathe
        await new Promise(r => setImmediate(r))
      }

      try {
        const stat = fs.statSync(filePath)
        const existingTrack = queries.getTrackByPath(filePath)

        // Skip if file hasn't changed
        if (existingTrack && existingTrack.last_modified === Math.floor(stat.mtimeMs)) continue

        const track = await extractMetadata(filePath, stat)
        const result = queries.upsertTrack(track)
        if (result.updated) updated++; else added++

      } catch (err) {
        errors++
        console.error('[Scanner] Error processing file:', filePath, err.message)
      }
    }

    // Remove tracks for deleted files
    let removed = 0
    for (const p of existingPaths) {
      if (!scannedPaths.has(p)) {
        queries.removeTrack(p)
        removed++
      }
    }

    for (const dir of libraryPaths) {
      try { queries.updateLibraryPathScan(dir) } catch (e) {}
    }

    const stats = { added, updated, removed, errors, total }
    console.log('[Scanner] Complete:', stats)
    onComplete?.(stats)
    return stats

  } catch (err) {
    console.error('[Scanner] Fatal error:', err)
    onError?.(err.message)
    throw err
  }
}

async function extractMetadata(filePath, stat) {
  let title = path.basename(filePath, path.extname(filePath))
  let artist = 'Unknown Artist', album = 'Unknown Album'
  let album_artist = null, genre = null, year = null
  let track_number = null, disc_number = null
  let duration = 0, bitrate = null, sample_rate = null
  let channels = null, bpm = null, comment = null
  let artworkPath = null, artworkHash = null

  try {
    // music-metadata v7 exports via CommonJS default
    const mm = require('music-metadata')
    const parseFile = mm.parseFile || (mm.default && mm.default.parseFile) || mm
    const parsed = await parseFile(filePath, { duration: true, skipCovers: false })
    const tags = parsed.common || {}
    const fmt  = parsed.format  || {}

    title        = tags.title || title
    artist       = tags.artist || tags.albumartist || artist
    album        = tags.album  || album
    album_artist = tags.albumartist || null
    genre        = Array.isArray(tags.genre) ? tags.genre[0] : (tags.genre || null)
    year         = tags.year   || null
    track_number = tags.track?.no || null
    disc_number  = tags.disk?.no  || null
    duration     = fmt.duration   || 0
    bitrate      = fmt.bitrate ? Math.round(fmt.bitrate / 1000) : null
    sample_rate  = fmt.sampleRate || null
    channels     = fmt.numberOfChannels || null
    bpm          = tags.bpm  || null
    comment      = Array.isArray(tags.comment)
      ? (tags.comment[0]?.text || tags.comment[0] || null)
      : (tags.comment || null)

    if (tags.picture && tags.picture.length > 0) {
      const pic = tags.picture[0]
      const hash = crypto.createHash('md5').update(pic.data).digest('hex')
      artworkHash = hash
      const cached = queries.getArtwork(hash)
      if (cached) {
        artworkPath = cached.file_path
      } else {
        artworkPath = await saveArtwork(pic.data, hash)
        if (artworkPath) queries.cacheArtwork(hash, artworkPath)
      }
    }
  } catch (err) {
    // Graceful fallback: parse artist - title from filename
    console.warn('[Scanner] Metadata parse failed for', path.basename(filePath), ':', err.message)
    const parts = title.split(' - ')
    if (parts.length >= 2) {
      artist = parts[0].trim()
      title  = parts.slice(1).join(' - ').trim()
    }
  }

  if (!artworkPath) artworkPath = findFolderArtwork(path.dirname(filePath))

  return {
    file_path:     filePath,
    title:         title || path.basename(filePath),
    artist,
    album,
    album_artist,
    genre,
    year,
    track_number,
    disc_number,
    duration,
    bitrate,
    sample_rate,
    channels,
    codec:         path.extname(filePath).slice(1).toUpperCase(),
    file_size:     stat.size,
    last_modified: Math.floor(stat.mtimeMs),
    artwork_path:  artworkPath,
    artwork_hash:  artworkHash,
    bpm,
    comment,
    color:         colorFromString(album || artist)
  }
}

async function saveArtwork(data, hash) {
  try {
    const { app } = require('electron')
    const artDir = path.join(app.getPath('userData'), 'artwork')
    if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true })
    const filePath = path.join(artDir, `${hash}.jpg`)
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, data)
    return filePath
  } catch (err) {
    console.error('[Scanner] Artwork save error:', err.message)
    return null
  }
}

function findFolderArtwork(dir) {
  const names = ['cover.jpg','cover.png','folder.jpg','folder.png','album.jpg','album.png','front.jpg','artwork.jpg','AlbumArt.jpg']
  for (const name of names) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

module.exports = { scanLibrary, extractMetadata }
