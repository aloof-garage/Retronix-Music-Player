'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize:    () => ipcRenderer.invoke('window:minimize'),
    maximize:    () => ipcRenderer.invoke('window:maximize'),
    close:       () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  settings: {
    get:    (key)        => ipcRenderer.invoke('settings:get', key),
    set:    (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: ()           => ipcRenderer.invoke('settings:getAll'),
    reset:  ()           => ipcRenderer.invoke('settings:reset'),
  },

  library: {
    getAllTracks:       ()             => ipcRenderer.invoke('library:getAllTracks'),
    searchTracks:      (q)            => ipcRenderer.invoke('library:searchTracks', q),
    getAllAlbums:       ()             => ipcRenderer.invoke('library:getAllAlbums'),
    getAllArtists:      ()             => ipcRenderer.invoke('library:getAllArtists'),
    getTracksByAlbum:  (album, artist)=> ipcRenderer.invoke('library:getTracksByAlbum', album, artist),
    getTracksByArtist: (artist)       => ipcRenderer.invoke('library:getTracksByArtist', artist),
    getFavorites:      ()             => ipcRenderer.invoke('library:getFavorites'),
    getRecentlyPlayed: (limit)        => ipcRenderer.invoke('library:getRecentlyPlayed', limit),
    getMostPlayed:     (limit)        => ipcRenderer.invoke('library:getMostPlayed', limit),
    toggleFavorite:    (trackId)      => ipcRenderer.invoke('library:toggleFavorite', trackId),
    recordPlay:        (trackId)      => ipcRenderer.invoke('library:recordPlay', trackId),
    getStats:          ()             => ipcRenderer.invoke('library:getStats'),
    getPaths:          ()             => ipcRenderer.invoke('library:getPaths'),
    addPath:           (dir)          => ipcRenderer.invoke('library:addPath', dir),
    removePath:        (dir)          => ipcRenderer.invoke('library:removePath', dir),
    browse:            ()             => ipcRenderer.invoke('library:browse'),
    scan:              (paths)        => ipcRenderer.invoke('library:scan', paths),
    importFiles:       (filePaths)    => ipcRenderer.invoke('library:importFiles', filePaths),
    browseFiles:       ()             => ipcRenderer.invoke('library:browseFiles'),
  },

  playlist: {
    getAll:      ()                      => ipcRenderer.invoke('playlist:getAll'),
    getTracks:   (id)                    => ipcRenderer.invoke('playlist:getTracks', id),
    create:      (name, desc, color)     => ipcRenderer.invoke('playlist:create', name, desc, color),
    update:      (id, name, desc)        => ipcRenderer.invoke('playlist:update', id, name, desc),
    delete:      (id)                    => ipcRenderer.invoke('playlist:delete', id),
    addTrack:    (plId, trackId)         => ipcRenderer.invoke('playlist:addTrack', plId, trackId),
    removeTrack: (plId, trackId)         => ipcRenderer.invoke('playlist:removeTrack', plId, trackId),
    reorder:     (plId, trackIds)        => ipcRenderer.invoke('playlist:reorder', plId, trackIds),
    export:      (id)                    => ipcRenderer.invoke('playlist:export', id),
    import:      ()                      => ipcRenderer.invoke('playlist:import'),
  },

  audio: {
    getFilePath:     (trackId)  => ipcRenderer.invoke('audio:getFilePath', trackId),
    openFile:        ()         => ipcRenderer.invoke('audio:openFile'),
    // KEY FIX: read audio file as base64 — avoids CSP + protocol issues
    readFileBase64:  (filePath) => ipcRenderer.invoke('audio:readFileBase64', filePath),
  },

  artwork: {
    get: (filePath) => ipcRenderer.invoke('artwork:get', filePath),
  },

  system: {
    getAppVersion:    ()      => ipcRenderer.invoke('system:getAppVersion'),
    getAppPath:       ()      => ipcRenderer.invoke('system:getAppPath'),
    openExternal:     (url)   => ipcRenderer.invoke('system:openExternal', url),
    showItemInFolder: (p)     => ipcRenderer.invoke('system:showItemInFolder', p),
    platform:         ()      => ipcRenderer.invoke('system:platform'),
  },

  tray: {
    updateTrack:     (info)      => ipcRenderer.send('tray:updateTrack', info),
    updatePlayState: (playing)   => ipcRenderer.send('tray:updatePlayState', playing),
  },

  notify: {
    trackChanged: (info) => ipcRenderer.send('notify:trackChanged', info),
  },

  on: (channel, callback) => {
    const allowed = ['media-key','tray-action','scan:progress','scan:complete','scan:started','scan:error','open-file']
    if (!allowed.includes(channel)) return () => {}
    const listener = (_, ...args) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
