'use strict'

const { glob }  = require('glob')
const path      = require('path')
const fs        = require('fs')
const crypto    = require('crypto')
const { queries } = require('./database/db')

const SUPPORTED_EXTS = new Set(['.mp3','.flac','.wav','.aac','.ogg','.m4a','.wma','.opus'])

function colorFromString(str) {
  const palette = ['#e8834a','#6b8dd6','#7ed4a0','#c478d4','#d4a478','#78c4d4','#d478a4','#a4d478']
  let h = 0
  for (let i = 0; i < (str || '').length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

async function scanLibrary(libraryPaths, onProgress, onComplete, onError) {
  try {
    // ── 1. Discover files ─────────────────────────────────────────────────
    let allFiles = []
    for (const dir of libraryPaths) {
      if (!fs.existsSync(dir)) { console.warn('[Scanner] Missing:', dir); continue }
      try {
        // Glob requires forward slashes even on Windows
        const fwdDir = dir.replace(/\\/g, '/')
        const found  = await glob('**/*', { cwd: fwdDir, absolute: true, nodir: true })
        const audio  = found
          .map(f => path.normalize(f))
          .filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()))
        allFiles = allFiles.concat(audio)
        console.log(`[Scanner] ${dir}: ${audio.length} audio files`)
      } catch (err) {
        console.error('[Scanner] glob error in', dir, err.message)
      }
    }

    allFiles = [...new Set(allFiles)]
    const total = allFiles.length
    console.log('[Scanner] Total files:', total)
    onProgress?.({ phase: 'scanning', current: 0, total, percent: 0, message: `Found ${total} files` })
    if (total === 0) { onComplete?.({ added: 0, updated: 0, removed: 0, errors: 0, total: 0 }); return { added: 0, updated: 0, removed: 0, errors: 0, total: 0 } }

    // ── 2. Build index of existing tracks ─────────────────────────────────
    const existing = queries.getAllTracks()
    const existingMap = new Map(existing.map(t => [t.file_path, t]))

    // ── 3. Process files ──────────────────────────────────────────────────
    const toUpsert = []
    let errors = 0

    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i]

      if (i % 20 === 0) {
        const pct = Math.round((i / total) * 100)
        onProgress?.({ phase: 'processing', current: i, total, percent: pct, message: `Processing ${i + 1}/${total}…` })
        await new Promise(r => setImmediate(r))  // yield so IPC events can flow
      }

      try {
        const stat = fs.statSync(filePath)
        const ex   = existingMap.get(filePath)

        // Skip unchanged files (same mtime)
        if (ex && ex.last_modified === Math.floor(stat.mtimeMs)) continue

        const track = await extractMetadata(filePath, stat)
        toUpsert.push(track)
      } catch (err) {
        errors++
        console.error('[Scanner] Error:', filePath, err.message)
      }
    }

    // ── 4. Bulk write (single disk flush) ─────────────────────────────────
    const { added, updated } = queries.bulkUpsertTracks(toUpsert)

    // ── 5. Remove stale tracks ────────────────────────────────────────────
    const validPaths = new Set(allFiles)
    const removed = queries.removeStaleTracks([...validPaths])

    for (const dir of libraryPaths) {
      try { queries.updateLibraryPathScan(dir) } catch (_) {}
    }

    const stats = { added, updated, removed, errors, total }
    console.log('[Scanner] Done:', stats)
    onComplete?.(stats)
    return stats

  } catch (err) {
    console.error('[Scanner] Fatal:', err)
    onError?.(err.message)
    throw err
  }
}

async function extractMetadata(filePath, stat) {
  let title  = path.basename(filePath, path.extname(filePath))
  let artist = 'Unknown Artist', album = 'Unknown Album'
  let album_artist = null, genre = null, year = null
  let track_number = null, disc_number = null
  let duration = 0, bitrate = null, sample_rate = null
  let channels = null, bpm = null, comment = null
  let artworkPath = null, artworkHash = null

  try {
    // music-metadata v7: require() gives the module object directly
    const mm = require('music-metadata')
    // Handle both default-export and named-export shapes
    const parseFile = (typeof mm.parseFile === 'function') ? mm.parseFile
                    : (mm.default && typeof mm.default.parseFile === 'function') ? mm.default.parseFile
                    : null
    if (!parseFile) throw new Error('parseFile not found in music-metadata')

    const parsed = await parseFile(filePath, { duration: true, skipCovers: false })
    const tags   = parsed.common || {}
    const fmt    = parsed.format  || {}

    title        = tags.title   || title
    artist       = tags.artist  || tags.albumartist || artist
    album        = tags.album   || album
    album_artist = tags.albumartist || null
    genre        = Array.isArray(tags.genre) ? tags.genre[0] : (tags.genre || null)
    year         = tags.year   || null
    track_number = tags.track?.no  || null
    disc_number  = tags.disk?.no   || null
    duration     = fmt.duration    || 0
    bitrate      = fmt.bitrate     ? Math.round(fmt.bitrate / 1000) : null
    sample_rate  = fmt.sampleRate  || null
    channels     = fmt.numberOfChannels || null
    bpm          = tags.bpm        || null
    comment      = Array.isArray(tags.comment)
      ? (tags.comment[0]?.text || tags.comment[0] || null)
      : (tags.comment || null)

    if (tags.picture?.length > 0) {
      const pic  = tags.picture[0]
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
    console.warn('[Scanner] Metadata parse failed:', path.basename(filePath), '-', err.message)
    // Fallback: "Artist - Title" filename pattern
    const parts = title.split(' - ')
    if (parts.length >= 2) { artist = parts[0].trim(); title = parts.slice(1).join(' - ').trim() }
  }

  if (!artworkPath) artworkPath = findFolderArtwork(path.dirname(filePath))

  return {
    file_path:     filePath,
    title:         title || path.basename(filePath),
    artist,  album,  album_artist,  genre,  year,
    track_number,  disc_number,  duration,
    bitrate,  sample_rate,  channels,
    codec:         path.extname(filePath).slice(1).toUpperCase(),
    file_size:     stat.size,
    last_modified: Math.floor(stat.mtimeMs),
    artwork_path:  artworkPath,
    artwork_hash:  artworkHash,
    bpm,  comment,
    color: colorFromString(album || artist),
  }
}

async function saveArtwork(data, hash) {
  try {
    const { app } = require('electron')
    const artDir  = path.join(app.getPath('userData'), 'artwork')
    if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true })
    const fp = path.join(artDir, `${hash}.jpg`)
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, data)
    return fp
  } catch (err) {
    console.error('[Scanner] Artwork save error:', err.message)
    return null
  }
}

function findFolderArtwork(dir) {
  for (const name of ['cover.jpg','cover.png','folder.jpg','folder.png','album.jpg','album.png','front.jpg','artwork.jpg']) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

module.exports = { scanLibrary, extractMetadata }
