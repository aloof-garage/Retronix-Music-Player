'use strict'

const { Tray, Menu, nativeImage, app } = require('electron')
const path = require('path')

let tray = null
let currentTrackInfo = { title: 'Not playing', artist: '' }

function createTrayManager(mainWindow, store) {
  // Create tray icon (use a simple colored icon if no resource file exists)
  let iconPath = path.join(__dirname, '../../resources/tray-icon.png')
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('Empty icon')
  } catch {
    // Create a simple 16x16 colored icon programmatically
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Retronix Music Player')

  const buildMenu = (isPlaying = false) => {
    return Menu.buildFromTemplate([
      {
        label: currentTrackInfo.title || 'Retronix MK·II',
        enabled: false,
        icon: null
      },
      {
        label: currentTrackInfo.artist || 'No track loaded',
        enabled: false
      },
      { type: 'separator' },
      {
        label: isPlaying ? '⏸  Pause' : '▶  Play',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('tray-action', 'toggle-play')
        }
      },
      {
        label: '⏮  Previous',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('tray-action', 'prev-track')
        }
      },
      {
        label: '⏭  Next',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('tray-action', 'next-track')
        }
      },
      { type: 'separator' },
      {
        label: '🔊  Volume Up',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('tray-action', 'volume-up')
        }
      },
      {
        label: '🔉  Volume Down',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('tray-action', 'volume-down')
        }
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        label: 'Hide Window',
        click: () => {
          if (mainWindow) mainWindow.hide()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Retronix',
        click: () => {
          app.isQuiting = true
          tray.destroy()
          app.quit()
        }
      }
    ])
  }

  tray.setContextMenu(buildMenu())

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  return {
    tray,
    updateTrackInfo: (title, artist, isPlaying) => {
      currentTrackInfo = { title, artist }
      tray.setToolTip(`Retronix: ${title} — ${artist}`)
      tray.setContextMenu(buildMenu(isPlaying))
    },
    updatePlayState: (isPlaying) => {
      tray.setContextMenu(buildMenu(isPlaying))
    },
    destroy: () => {
      if (tray) {
        tray.destroy()
        tray = null
      }
    }
  }
}

module.exports = { createTrayManager }
