'use strict'

const { globalShortcut } = require('electron')

function registerMediaKeys(mainWindow) {
  const send = (action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media-key', action)
    }
  }

  // Register global media keys
  const shortcuts = [
    ['MediaPlayPause', 'toggle-play'],
    ['MediaNextTrack', 'next-track'],
    ['MediaPreviousTrack', 'prev-track'],
    ['MediaStop', 'stop'],
  ]

  shortcuts.forEach(([key, action]) => {
    try {
      const registered = globalShortcut.register(key, () => send(action))
      if (!registered) {
        console.warn(`[MediaKeys] Failed to register: ${key}`)
      }
    } catch (err) {
      console.warn(`[MediaKeys] Error registering ${key}:`, err.message)
    }
  })

  console.log('[MediaKeys] Global media keys registered')
}

function unregisterMediaKeys() {
  globalShortcut.unregisterAll()
  console.log('[MediaKeys] Media keys unregistered')
}

module.exports = { registerMediaKeys, unregisterMediaKeys }
