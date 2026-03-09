'use strict'

const { ipcMain, dialog, shell, Notification, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { queries } = require('./database/db')
const { scanLibrary, extractMetadata } = require('./libraryScanner')

let scanInProgress = false

function registerIpcHandlers(mainWindow, store) {

  // ── WINDOW CONTROLS ────────────────────────────────────────────────────────
  ipcMain.handle('window:minimize',    () => { mainWindow.minimize() })
  ipcMain.handle('window:maximize',    () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close',       () => {
    if (store.get('minimizeToTray')) mainWindow.hide()
    else mainWindow.close()
  })
  ipcMain.handle('window:is-maximized', () => mainWindow.isMaximized())

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get',    (_, key) => store.get(key))
  ipcMain.handle('settings:set',    (_, key, value) => { store.set(key, value); return true })
  ipcMain.handle('settings:getAll', () => store.store)
  ipcMain.handle('settings:reset',  () => { store.clear(); return true })

  // ── LIBRARY — READ ────────────────────────────────────────────────────────
  ipcMain.handle('library:getAllTracks',    () => { try { return queries.getAllTracks()          } catch (e) { console.error(e); return [] } })
  ipcMain.handle('library:searchTracks',   (_, q) => { try { return queries.searchTracks(q)     } catch (e) { return [] } })
  ipcMain.handle('library:getAllAlbums',   () => { try { return queries.getAllAlbums()            } catch (e) { return [] } })
  ipcMain.handle('library:getAllArtists',  () => { try { return queries.getAllArtists()           } catch (e) { return [] } })
  ipcMain.handle('library:getTracksByAlbum',  (_, album, artist) => { try { return queries.getTracksByAlbum(album, artist) } catch (e) { return [] } })
  ipcMain.handle('library:getTracksByArtist', (_, artist)        => { try { return queries.getTracksByArtist(artist)       } catch (e) { return [] } })
  ipcMain.handle('library:getFavorites',   () => { try { return queries.getFavoriteTracks()       } catch (e) { return [] } })
  ipcMain.handle('library:getRecentlyPlayed', (_, limit) => { try { return queries.getRecentlyPlayed(limit || 50) } catch (e) { return [] } })
  ipcMain.handle('library:getMostPlayed',     (_, limit) => { try { return queries.getMostPlayed(limit || 50)     } catch (e) { return [] } })
  ipcMain.handle('library:getStats',      () => { try { return queries.getLibraryStats()          } catch (e) { return null } })

  // ── LIBRARY — WRITE ───────────────────────────────────────────────────────
  ipcMain.handle('library:toggleFavorite', (_, trackId) => {
    try {
      const result = queries.toggleFavorite(trackId)
      return { id: trackId, favorite: result?.favorite === 1 }
    } catch (e) { console.error(e); return null }
  })

  ipcMain.handle('library:recordPlay', (_, trackId) => {
    try { queries.updateTrackPlays(trackId); return true } catch (e) { return false }
  })

  // ── LIBRARY PATHS ─────────────────────────────────────────────────────────
  ipcMain.handle('library:getPaths', () => {
    try { return queries.getLibraryPaths() } catch (e) { return [] }
  })

  ipcMain.handle('library:addPath', (_, dirPath) => {
    try {
      queries.addLibraryPath(dirPath)
      const paths = store.get('libraryPaths') || []
      if (!paths.includes(dirPath)) store.set('libraryPaths', [...paths, dirPath])
      return true
    } catch (e) { console.error(e); return false }
  })

  ipcMain.handle('library:removePath', (_, dirPath) => {
    try {
      queries.removeLibraryPath(dirPath)
      store.set('libraryPaths', (store.get('libraryPaths') || []).filter(p => p !== dirPath))
      return true
    } catch (e) { return false }
  })

  ipcMain.handle('library:browse', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Music Folder',
      properties: ['openDirectory', 'multiSelections']
    })
    return result.canceled ? null : result.filePaths
  })

  // ── LIBRARY SCAN ─────────────────────────────────────────────────────────
  ipcMain.handle('library:scan', async (_, paths) => {
    if (scanInProgress) return { error: 'Scan already in progress' }
    scanInProgress = true
    mainWindow.webContents.send('scan:started')

    try {
      const libraryPaths = paths && paths.length > 0
        ? paths
        : queries.getLibraryPaths().map(p => p.path)

      if (libraryPaths.length === 0) {
        mainWindow.webContents.send('scan:error', 'No library paths configured')
        return { error: 'No library paths configured' }
      }

      const result = await scanLibrary(
        libraryPaths,
        (progress) => { try { mainWindow.webContents.send('scan:progress', progress) } catch (e) {} },
        (stats)    => { try { mainWindow.webContents.send('scan:complete', stats)    } catch (e) {} },
        (error)    => { try { mainWindow.webContents.send('scan:error', error)       } catch (e) {} }
      )
      return result
    } catch (err) {
      console.error('[IPC] Scan error:', err)
      try { mainWindow.webContents.send('scan:error', err.message) } catch (e) {}
      return { error: err.message }
    } finally {
      scanInProgress = false
    }
  })

  // ── IMPORT INDIVIDUAL FILES ───────────────────────────────────────────────
  // Handles both browsing for files and importing a pre-supplied list.
  ipcMain.handle('library:browseFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Audio Files',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'opus'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('library:importFiles', async (_, filePaths) => {
    if (!filePaths || !filePaths.length) return { added: 0, updated: 0, errors: 0 }
    let added = 0, updated = 0, errors = 0

    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) { errors++; continue }
        const stat = fs.statSync(filePath)
        const track = await extractMetadata(filePath, stat)
        const result = queries.upsertTrack(track)
        if (result.updated) updated++; else added++
      } catch (err) {
        console.error('[IPC] Import file error:', filePath, err.message)
        errors++
      }
    }

    console.log(`[IPC] importFiles: added=${added} updated=${updated} errors=${errors}`)
    return { added, updated, errors }
  })

  // ── PLAYLISTS ─────────────────────────────────────────────────────────────
  ipcMain.handle('playlist:getAll',    () => { try { return queries.getAllPlaylists()             } catch (e) { return [] } })
  ipcMain.handle('playlist:getTracks', (_, id) => { try { return queries.getPlaylistTracks(id)   } catch (e) { return [] } })

  ipcMain.handle('playlist:create', (_, name, description, color) => {
    try { return queries.createPlaylist(name, description, color) }
    catch (e) { console.error('[IPC] playlist:create', e); return null }
  })

  ipcMain.handle('playlist:update', (_, id, name, description) => {
    try { queries.updatePlaylist(id, name, description); return true } catch (e) { return false }
  })

  ipcMain.handle('playlist:delete', (_, id) => {
    try { queries.deletePlaylist(id); return true } catch (e) { return false }
  })

  ipcMain.handle('playlist:addTrack', (_, playlistId, trackId) => {
    try { queries.addTrackToPlaylist(playlistId, trackId); return true } catch (e) { console.error(e); return false }
  })

  ipcMain.handle('playlist:removeTrack', (_, playlistId, trackId) => {
    try { queries.removeTrackFromPlaylist(playlistId, trackId); return true } catch (e) { return false }
  })

  ipcMain.handle('playlist:reorder', (_, playlistId, trackIds) => {
    try { queries.reorderPlaylistTracks(playlistId, trackIds); return true } catch (e) { return false }
  })

  // M3U Export
  ipcMain.handle('playlist:export', async (_, playlistId) => {
    try {
      const playlist = queries.getPlaylistById(playlistId)
      const tracks = queries.getPlaylistTracks(playlistId)
      if (!playlist || !tracks.length) return null

      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Playlist',
        defaultPath: `${playlist.name}.m3u8`,
        filters: [{ name: 'M3U Playlist', extensions: ['m3u', 'm3u8'] }]
      })
      if (result.canceled) return null

      let m3u = '#EXTM3U\n'
      m3u += `#PLAYLIST:${playlist.name}\n`
      for (const track of tracks) {
        m3u += `#EXTINF:${Math.round(track.duration)},${track.artist} - ${track.title}\n`
        m3u += `${track.file_path}\n`
      }
      fs.writeFileSync(result.filePath, m3u, 'utf8')
      return result.filePath
    } catch (e) { console.error(e); return null }
  })

  // M3U Import
  ipcMain.handle('playlist:import', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Playlist',
        filters: [{ name: 'M3U Playlist', extensions: ['m3u', 'm3u8'] }],
        properties: ['openFile']
      })
      if (result.canceled) return null

      const content = fs.readFileSync(result.filePaths[0], 'utf8')
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
      const name = path.basename(result.filePaths[0], path.extname(result.filePaths[0]))
      const playlistId = queries.createPlaylist(name)

      let added = 0
      for (const line of lines) {
        if (line.startsWith('#')) continue
        const track = queries.getTrackByPath(line)
        if (track) { queries.addTrackToPlaylist(playlistId, track.id); added++ }
      }
      return { playlistId, name, tracksAdded: added }
    } catch (e) { console.error(e); return null }
  })

  // ── AUDIO FILE ACCESS ─────────────────────────────────────────────────────
  ipcMain.handle('audio:getFilePath', (_, trackId) => {
    try { return queries.getTrackById(trackId)?.file_path || null } catch (e) { return null }
  })

  ipcMain.handle('audio:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Audio File',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'opus'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? null : result.filePaths
  })

  // KEY HANDLER: reads audio file bytes and returns base64 to renderer.
  // This bypasses CSP / protocol restrictions entirely — the renderer decodes
  // base64 → ArrayBuffer → AudioBuffer without ever making a network request.
  ipcMain.handle('audio:readFileBase64', (_, filePath) => {
    if (!filePath) return null
    try {
      if (!fs.existsSync(filePath)) {
        console.error('[IPC] audio:readFileBase64 — file not found:', filePath)
        return null
      }
      const data = fs.readFileSync(filePath)
      return data.toString('base64')
    } catch (err) {
      console.error('[IPC] audio:readFileBase64 error:', err.message)
      return null
    }
  })

  // ── ARTWORK ───────────────────────────────────────────────────────────────
  ipcMain.handle('artwork:get', (_, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return null
    try {
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
      return `data:${mime};base64,${data.toString('base64')}`
    } catch (e) { return null }
  })

  // ── TRAY ──────────────────────────────────────────────────────────────────
  ipcMain.on('tray:updateTrack', (_, info) => {
    try { global.trayManager?.updateTrackInfo?.(info.title, info.artist, info.isPlaying) } catch (e) {}
  })
  ipcMain.on('tray:updatePlayState', (_, isPlaying) => {
    try { global.trayManager?.updatePlayState?.(isPlaying) } catch (e) {}
  })

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  ipcMain.on('notify:trackChanged', (_, info) => {
    try {
      if (Notification.isSupported()) {
        new Notification({ title: info.title, body: `${info.artist} — ${info.album}`, silent: true }).show()
      }
    } catch (e) {}
  })

  // ── SYSTEM ────────────────────────────────────────────────────────────────
  ipcMain.handle('system:getAppVersion',    () => app.getVersion())
  ipcMain.handle('system:getAppPath',       () => app.getPath('userData'))
  ipcMain.handle('system:openExternal',     (_, url) => shell.openExternal(url))
  ipcMain.handle('system:showItemInFolder', (_, filePath) => shell.showItemInFolder(filePath))
  ipcMain.handle('system:platform',         () => process.platform)

  console.log('[IPC] All handlers registered')
}

module.exports = { registerIpcHandlers }
