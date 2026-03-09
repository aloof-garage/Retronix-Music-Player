'use strict'

const { app, BrowserWindow, ipcMain, globalShortcut, nativeTheme, dialog, shell, protocol } = require('electron')
const path = require('path')
const { createTrayManager } = require('./trayManager')
const { registerMediaKeys } = require('./mediaKeys')
const { registerIpcHandlers } = require('./ipcHandlers')
const { initDatabase } = require('./database/db')
const Store = require('electron-store')

// ── Electron Store (persistent settings) ─────────────────────────────────────
const store = new Store({
  name: 'retronix-settings',
  defaults: {
    windowBounds: { width: 1280, height: 800 },
    windowMaximized: false,
    theme: 'dark',
    volume: 75,
    equalizer: {
      enabled: true,
      preset: 'flat',
      bands: { 31: 0, 62: 0, 125: 0, 250: 0, 500: 0, 1000: 0, 2000: 0, 4000: 0, 8000: 0, 16000: 0 }
    },
    libraryPaths: [],
    visualizer: { type: 'spectrum', fps: 60 },
    playback: {
      shuffle: false,
      repeat: 0,
      crossfade: 0,
      gapless: true
    },
    startMinimized: false,
    minimizeToTray: true,
    lastSection: 'library'
  }
})

// ── Make store accessible from IPC handlers ──────────────────────────────────
global.store = store

let mainWindow = null
let trayManager = null

// ── Protocol registration for local audio files ───────────────────────────────
app.whenReady().then(() => {
  protocol.registerFileProtocol('retronix', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('retronix:///', ''))
    callback({ path: filePath })
  })
})

// ── Create main window ────────────────────────────────────────────────────────
function createMainWindow() {
  const { width, height } = store.get('windowBounds')

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#12141f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: true // For Web Audio API
    },
    icon: path.join(__dirname, '../../resources/icon.png')
  })

  // Load the renderer
  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // ── Window ready ─────────────────────────────────────────────────────────
  mainWindow.once('ready-to-show', () => {
    if (!store.get('startMinimized')) {
      mainWindow.show()
    }
    if (store.get('windowMaximized')) {
      mainWindow.maximize()
    }
  })

  // ── Save window bounds ────────────────────────────────────────────────────
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds())
    }
  })
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds())
    }
  })
  mainWindow.on('maximize', () => store.set('windowMaximized', true))
  mainWindow.on('unmaximize', () => store.set('windowMaximized', false))

  // ── Minimize to tray ──────────────────────────────────────────────────────
  mainWindow.on('close', (e) => {
    if (store.get('minimizeToTray') && trayManager) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // ── Handle drag-and-drop files ────────────────────────────────────────────
  mainWindow.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      shell.openExternal(url)
    }
  })

  return mainWindow
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Initialize database
  try {
    await initDatabase()
    console.log('[Main] Database initialized')
  } catch (err) {
    console.error('[Main] Database init error:', err)
  }

  // Create window
  createMainWindow()

  // System tray
  trayManager = createTrayManager(mainWindow, store)

  // Media keys
  registerMediaKeys(mainWindow)

  // IPC handlers
  registerIpcHandlers(mainWindow, store)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    } else if (mainWindow) {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    globalShortcut.unregisterAll()
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// ── Open files from CLI / file association ────────────────────────────────────
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow) {
    mainWindow.webContents.send('open-file', filePath)
  }
})

// ── Second instance (single instance lock) ───────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      // Check for file arguments
      const filePath = argv.find(arg => /\.(mp3|flac|wav|aac|ogg|m4a)$/i.test(arg))
      if (filePath) {
        mainWindow.webContents.send('open-file', filePath)
      }
    }
  })
}

module.exports = { getMainWindow: () => mainWindow, getStore: () => store }
