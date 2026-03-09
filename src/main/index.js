'use strict'

const { app, BrowserWindow, globalShortcut, shell, protocol, net } = require('electron')
const path = require('path')
const Store = require('electron-store')

// ── registerSchemesAsPrivileged MUST be called before app is ready ────────────
// This makes retronix:// fetchable from the renderer via fetch() / Web Audio API.
protocol.registerSchemesAsPrivileged([{
  scheme: 'retronix',
  privileges: {
    secure: true,
    standard: true,
    supportFetchAPI: true,   // enables fetch() in renderer
    corsEnabled: true,
    stream: true,            // enables streaming (important for large audio files)
  }
}])

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
    playback: { shuffle: false, repeat: 0, crossfade: 0, gapless: true },
    startMinimized: false,
    minimizeToTray: true,
    lastSection: 'library'
  }
})

global.store = store

let mainWindow = null
let trayManager = null

// ── Single-instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// ── Create main window ────────────────────────────────────────────────────────
function createMainWindow() {
  const { width, height } = store.get('windowBounds')

  mainWindow = new BrowserWindow({
    width, height, minWidth: 900, minHeight: 600,
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
    },
    icon: path.join(__dirname, '../../resources/icon.png')
  })

  // Load renderer
  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!store.get('startMinimized')) mainWindow.show()
    if (store.get('windowMaximized')) mainWindow.maximize()
  })

  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) store.set('windowBounds', mainWindow.getBounds())
  })
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) store.set('windowBounds', mainWindow.getBounds())
  })
  mainWindow.on('maximize', () => store.set('windowMaximized', true))
  mainWindow.on('unmaximize', () => store.set('windowMaximized', false))

  mainWindow.on('close', (e) => {
    if (store.get('minimizeToTray') && trayManager) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

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

  // ── Register retronix:// protocol ─────────────────────────────────────────
  // Uses protocol.handle (Electron 25+) which is fetchable from renderer.
  protocol.handle('retronix', (request) => {
    // URL is retronix:///path/to/file (or retronix:///C:/path on Windows)
    // Decode the path component after the triple slash.
    const encoded = request.url.slice('retronix:///'.length)
    let filePath = decodeURIComponent(encoded)

    // On Windows paths arrive as C:/... (already forward slashes from encodeURIComponent)
    // net.fetch requires file:/// prefix
    const fileUrl = 'file:///' + filePath.replace(/\\/g, '/')
    return net.fetch(fileUrl)
  })

  // ── Init database ──────────────────────────────────────────────────────────
  const { initDatabase } = require('./database/db')
  try {
    initDatabase()
    console.log('[Main] Database initialized')
  } catch (err) {
    console.error('[Main] Database init error:', err)
  }

  // ── Create window ──────────────────────────────────────────────────────────
  createMainWindow()

  // ── Tray ──────────────────────────────────────────────────────────────────
  const { createTrayManager } = require('./trayManager')
  trayManager = createTrayManager(mainWindow, store)
  global.trayManager = trayManager

  // ── Media keys ────────────────────────────────────────────────────────────
  const { registerMediaKeys } = require('./mediaKeys')
  registerMediaKeys(mainWindow)

  // ── IPC handlers ──────────────────────────────────────────────────────────
  const { registerIpcHandlers } = require('./ipcHandlers')
  registerIpcHandlers(mainWindow, store)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else if (mainWindow) mainWindow.show()
  })
})

app.on('second-instance', (event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const filePath = argv.find(arg => /\.(mp3|flac|wav|aac|ogg|m4a|wma|opus)$/i.test(arg))
    if (filePath) mainWindow.webContents.send('open-file', filePath)
  }
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

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow) mainWindow.webContents.send('open-file', filePath)
})

module.exports = { getMainWindow: () => mainWindow, getStore: () => store }
