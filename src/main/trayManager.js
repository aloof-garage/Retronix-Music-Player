'use strict'

const { Tray, Menu, nativeImage, app } = require('electron')
const path = require('path')

let tray = null
let currentTrackInfo = { title: 'Not playing', artist: '' }
let currentlyPlaying = false

// No-op manager returned when tray creation fails
const noopManager = {
  tray: null,
  updateTrackInfo: () => {},
  updatePlayState: () => {},
  destroy: () => {},
}

function createTrayManager(mainWindow, store) {
  try {
    return _createTrayManager(mainWindow, store)
  } catch (err) {
    console.warn('[Tray] Could not create system tray (non-fatal):', err.message)
    return noopManager
  }
}

function _createTrayManager(mainWindow, store) {
  // Try to load the icon; fall back to a 1×1 transparent PNG if the file is missing.
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png')
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
    // On some platforms createFromPath returns empty for missing files
    if (icon.isEmpty()) throw new Error('empty')
  } catch {
    // Minimal 1×1 transparent PNG as a data URL fallback
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    )
  }

  tray = new Tray(icon)
  tray.setToolTip('Retronix Music Player')

  function buildMenu(isPlaying) {
    return Menu.buildFromTemplate([
      { label: currentTrackInfo.title || 'Retronix MK·II', enabled: false },
      { label: currentTrackInfo.artist || 'No track loaded', enabled: false },
      { type: 'separator' },
      { label: isPlaying ? '⏸  Pause' : '▶  Play',     click: () => send(mainWindow, 'toggle-play') },
      { label: '⏮  Previous',                            click: () => send(mainWindow, 'prev-track') },
      { label: '⏭  Next',                                click: () => send(mainWindow, 'next-track') },
      { type: 'separator' },
      { label: 'Show Window', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { label: 'Hide Window', click: () => mainWindow?.hide() },
      { type: 'separator' },
      { label: 'Quit Retronix', click: () => { app.isQuiting = true; tray?.destroy(); app.quit() } },
    ])
  }

  tray.setContextMenu(buildMenu(false))
  tray.on('click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show() } })
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })

  return {
    tray,
    updateTrackInfo: (title, artist, isPlaying) => {
      currentTrackInfo = { title, artist }
      currentlyPlaying = isPlaying
      try { tray.setToolTip(`${title} — ${artist}`) } catch (e) {}
      try { tray.setContextMenu(buildMenu(isPlaying)) } catch (e) {}
    },
    updatePlayState: (isPlaying) => {
      currentlyPlaying = isPlaying
      try { tray.setContextMenu(buildMenu(isPlaying)) } catch (e) {}
    },
    destroy: () => { try { tray?.destroy(); tray = null } catch (e) {} },
  }
}

function send(mainWindow, action) {
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tray-action', action) } catch (e) {}
}

module.exports = { createTrayManager }
