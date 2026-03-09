'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// ── Expose safe API to renderer process ───────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  // Library
  library: {
    getAllTracks: () => ipcRenderer.invoke('library:getAllTracks'),
    searchTracks: (query) => ipcRenderer.invoke('library:searchTracks', query),
    getAllAlbums: () => ipcRenderer.invoke('library:getAllAlbums'),
    getAllArtists: () => ipcRenderer.invoke('library:getAllArtists'),
    getTracksByAlbum: (album, artist) => ipcRenderer.invoke('library:getTracksByAlbum', album, artist),
    getTracksByArtist: (artist) => ipcRenderer.invoke('library:getTracksByArtist', artist),
    getFavorites: () => ipcRenderer.invoke('library:getFavorites'),
    getRecentlyPlayed: (limit) => ipcRenderer.invoke('library:getRecentlyPlayed', limit),
    getMostPlayed: (limit) => ipcRenderer.invoke('library:getMostPlayed', limit),
    toggleFavorite: (trackId) => ipcRenderer.invoke('library:toggleFavorite', trackId),
    recordPlay: (trackId) => ipcRenderer.invoke('library:recordPlay', trackId),
    getStats: () => ipcRenderer.invoke('library:getStats'),
    getPaths: () => ipcRenderer.invoke('library:getPaths'),
    addPath: (dir) => ipcRenderer.invoke('library:addPath', dir),
    removePath: (dir) => ipcRenderer.invoke('library:removePath', dir),
    browse: () => ipcRenderer.invoke('library:browse'),
    scan: (paths) => ipcRenderer.invoke('library:scan', paths),
  },

  // Playlists
  playlist: {
    getAll: () => ipcRenderer.invoke('playlist:getAll'),
    getTracks: (id) => ipcRenderer.invoke('playlist:getTracks', id),
    create: (name, desc, color) => ipcRenderer.invoke('playlist:create', name, desc, color),
    update: (id, name, desc) => ipcRenderer.invoke('playlist:update', id, name, desc),
    delete: (id) => ipcRenderer.invoke('playlist:delete', id),
    addTrack: (playlistId, trackId) => ipcRenderer.invoke('playlist:addTrack', playlistId, trackId),
    removeTrack: (playlistId, trackId) => ipcRenderer.invoke('playlist:removeTrack', playlistId, trackId),
    reorder: (playlistId, trackIds) => ipcRenderer.invoke('playlist:reorder', playlistId, trackIds),
    export: (id) => ipcRenderer.invoke('playlist:export', id),
    import: () => ipcRenderer.invoke('playlist:import'),
  },

  // Audio
  audio: {
    getFilePath: (trackId) => ipcRenderer.invoke('audio:getFilePath', trackId),
    openFile: () => ipcRenderer.invoke('audio:openFile'),
  },

  // Artwork
  artwork: {
    get: (filePath) => ipcRenderer.invoke('artwork:get', filePath),
  },

  // System
  system: {
    getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
    getAppPath: () => ipcRenderer.invoke('system:getAppPath'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    showItemInFolder: (path) => ipcRenderer.invoke('system:showItemInFolder', path),
    platform: () => ipcRenderer.invoke('system:platform'),
  },

  // Tray updates (send only, no response needed)
  tray: {
    updateTrack: (info) => ipcRenderer.send('tray:updateTrack', info),
    updatePlayState: (playing) => ipcRenderer.send('tray:updatePlayState', playing),
  },

  // Notifications
  notify: {
    trackChanged: (info) => ipcRenderer.send('notify:trackChanged', info),
  },

  // Event listeners
  on: (channel, callback) => {
    const allowedChannels = [
      'media-key', 'tray-action', 'scan:progress', 'scan:complete',
      'scan:started', 'scan:error', 'open-file'
    ]
    if (allowedChannels.includes(channel)) {
      const listener = (_, ...args) => callback(...args)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
    console.warn('[Preload] Blocked channel:', channel)
    return () => {}
  },

  once: (channel, callback) => {
    const allowedChannels = ['scan:complete', 'scan:error']
    if (allowedChannels.includes(channel)) {
      ipcRenderer.once(channel, (_, ...args) => callback(...args))
    }
  }
})
