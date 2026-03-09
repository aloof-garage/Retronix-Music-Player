'use strict'

const { ipcMain, dialog, shell, Notification, app, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { queries, getDb } = require('./database/db')
const { scanLibrary } = require('./libraryScanner')

let scanInProgress = false

function registerIpcHandlers(mainWindow, store) {
  // ── WINDOW CONTROLS ────────────────────────────────────────────────────────
  ipcMain.handle('window:minimize', () => mainWindow.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => {
    if (store.get('minimizeToTray')) mainWindow.hide()
    else mainWindow.close()
  })
  ipcMain.handle('window:is-maximized', () => mainWindow.isMaximized())

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', (_, key) => key ? store.get(key) : store.store)
  ipcMain.handle('settings:set', (_, key, value) => {
    store.set(key, value)
    return true
  })
  ipcMain.handle('settings:getAll', () => store.store)
  ipcMain.handle('settings:reset', () => { store.clear(); return true })

  // ── LIBRARY ───────────────────────────────────────────────────────────────
  ipcMain.handle('library:getAllTracks', () => {
    try { return queries.getAllTracks() }
    catch (e) { return [] }
  })

  ipcMain.handle('library:searchTracks', (_, query) => {
    try { return queries.searchTracks(query) }
    catch (e) { return [] }
  })

  ipcMain.handle('library:getAllAlbums', () => {
    try { return queries.getAllAlbums() }
    catch (e) { return [] }
  })

  ipcMain.handle('library:getAllArtists', () => {
    try { return queries.getAllArtists() }
    catch (e) { return [] }
  })

  ipcMain.handle('library:getTracksByAlbum', (_, album, artist) => {
    try { return queries.getTracksByAlbum(album, artist) }
    catch (e) { return [] }
  })

  ipcMain.handle('library:getTracksByArtist', (_, artist) => {
    try { return queries.getTracksByArtist(artist) }
    catch (e) { return [] }
  })

  ipcMain.handle('library:getFavorites', () => {
    try { return queries.getFavoriteTracks() }
    catch (e) { return [] }
  })

  ipcMain.handle('library:getRecentlyPlayed', (_, limit) => {
    try { return queries.getRecentlyPlayed(limit || 50) }
    catch (e) { return [] }
  })

  ipcMain.handle('library:getMostPlayed', (_, limit) => {
    try { return queries.getMostPlayed(limit || 50) }
    catch (e) { return [] }
  })

  ipcMain.handle('library:toggleFavorite', (_, trackId) => {
    try {
      queries.toggleFavorite(trackId)
      const track = queries.getTrackById(trackId)
      return { id: trackId, favorite: !!track?.favorite }
    } catch (e) { return null }
  })

  ipcMain.handle('library:recordPlay', (_, trackId) => {
    try {
      queries.updateTrackPlays(trackId)
      return true
    } catch (e) { return false }
  })

  ipcMain.handle('library:getStats', () => {
    try { return queries.getLibraryStats() }
    catch (e) { return null }
  })

  // ── LIBRARY PATHS ─────────────────────────────────────────────────────────
  ipcMain.handle('library:getPaths', () => {
    try { return queries.getLibraryPaths() }
    catch (e) { return [] }
  })

  ipcMain.handle('library:addPath', async (_, dirPath) => {
    try {
      queries.addLibraryPath(dirPath)
      const paths = store.get('libraryPaths') || []
      if (!paths.includes(dirPath)) {
        store.set('libraryPaths', [...paths, dirPath])
      }
      return true
    } catch (e) { return false }
  })

  ipcMain.handle('library:removePath', (_, dirPath) => {
    try {
      queries.removeLibraryPath(dirPath)
      const paths = store.get('libraryPaths') || []
      store.set('libraryPaths', paths.filter(p => p !== dirPath))
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
      const libraryPaths = paths || queries.getLibraryPaths().map(p => p.path)
      if (libraryPaths.length === 0) return { error: 'No library paths configured' }

      const result = await scanLibrary(
        libraryPaths,
        (progress) => mainWindow.webContents.send('scan:progress', progress),
        (stats) => mainWindow.webContents.send('scan:complete', stats),
        (error) => mainWindow.webContents.send('scan:error', error)
      )
      return result
    } catch (err) {
      mainWindow.webContents.send('scan:error', err.message)
      return { error: err.message }
    } finally {
      scanInProgress = false
    }
  })

  // ── PLAYLISTS ─────────────────────────────────────────────────────────────
  ipcMain.handle('playlist:getAll', () => {
    try { return queries.getAllPlaylists() }
    catch (e) { return [] }
  })

  ipcMain.handle('playlist:getTracks', (_, playlistId) => {
    try { return queries.getPlaylistTracks(playlistId) }
    catch (e) { return [] }
  })

  ipcMain.handle('playlist:create', (_, name, description, color) => {
    try { return queries.createPlaylist(name, description, color) }
    catch (e) { return null }
  })

  ipcMain.handle('playlist:update', (_, id, name, description) => {
    try { queries.updatePlaylist(id, name, description); return true }
    catch (e) { return false }
  })

  ipcMain.handle('playlist:delete', (_, id) => {
    try { queries.deletePlaylist(id); return true }
    catch (e) { return false }
  })

  ipcMain.handle('playlist:addTrack', (_, playlistId, trackId) => {
    try { queries.addTrackToPlaylist(playlistId, trackId); return true }
    catch (e) { return false }
  })

  ipcMain.handle('playlist:removeTrack', (_, playlistId, trackId) => {
    try { queries.removeTrackFromPlaylist(playlistId, trackId); return true }
    catch (e) { return false }
  })

  ipcMain.handle('playlist:reorder', (_, playlistId, trackIds) => {
    try { queries.reorderPlaylistTracks(playlistId, trackIds); return true }
    catch (e) { return false }
  })

  // M3U export
  ipcMain.handle('playlist:export', async (_, playlistId) => {
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
  })

  // M3U import
  ipcMain.handle('playlist:import', async () => {
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
      if (track) {
        queries.addTrackToPlaylist(playlistId, track.id)
        added++
      }
    }

    return { playlistId, name, tracksAdded: added }
  })

  // ── AUDIO FILE ACCESS ─────────────────────────────────────────────────────
  ipcMain.handle('audio:getFilePath', (_, trackId) => {
    const track = queries.getTrackById(trackId)
    return track?.file_path || null
  })

  ipcMain.handle('audio:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Audio File',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? null : result.filePaths
  })

  // ── ARTWORK ───────────────────────────────────────────────────────────────
  ipcMain.handle('artwork:get', (_, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return null
    try {
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
      return `data:${mime};base64,${data.toString('base64')}`
    } catch { return null }
  })

  // ── TRAY UPDATES ──────────────────────────────────────────────────────────
  ipcMain.on('tray:updateTrack', (_, info) => {
    if (global.trayManager) {
      global.trayManager.updateTrackInfo(info.title, info.artist, info.isPlaying)
    }
  })

  ipcMain.on('tray:updatePlayState', (_, isPlaying) => {
    if (global.trayManager) {
      global.trayManager.updatePlayState(isPlaying)
    }
  })

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  ipcMain.on('notify:trackChanged', (_, info) => {
    if (Notification.isSupported()) {
      new Notification({
        title: info.title,
        body: `${info.artist} — ${info.album}`,
        silent: true
      }).show()
    }
  })

  // ── SYSTEM ────────────────────────────────────────────────────────────────
  ipcMain.handle('system:getAppVersion', () => app.getVersion())
  ipcMain.handle('system:getAppPath', () => app.getPath('userData'))
  ipcMain.handle('system:openExternal', (_, url) => shell.openExternal(url))
  ipcMain.handle('system:showItemInFolder', (_, filePath) => shell.showItemInFolder(filePath))
  ipcMain.handle('system:platform', () => process.platform)

  console.log('[IPC] All handlers registered')
}

module.exports = { registerIpcHandlers }
