# 🎛️ Retronix Music Player MK·II

A production-ready desktop music player with a **skeuomorphic Hi-Fi aesthetic** — built with Electron, React, and Web Audio API.

![Retronix MK·II](resources/screenshot.png)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎵 **Audio Engine** | Web Audio API with gapless playback & crossfade |
| 🎚️ **10-Band EQ** | BiquadFilter nodes, 31Hz–16kHz, ±12dB |
| 📊 **5 Visualizers** | Spectrum, Waveform, LED Bars, Circular, Oscilloscope |
| 📁 **Library Scanner** | Recursive scan, metadata extraction, SQLite database |
| 🎨 **Skeuomorphic UI** | Rotary knobs, VU meters, LED indicators, LCD displays |
| 🌙 **Dark/Light** | Full theme system with neumorphic shadows |
| 📋 **Playlists** | Create, reorder, M3U import/export |
| 🔀 **Queue System** | Shuffle, repeat, play next |
| 🔔 **System Tray** | Background playback, tray controls |
| ⌨️ **Media Keys** | Global keyboard media key support |
| 🗄️ **SQLite DB** | Full library with search, indexing, play history |

## 🎵 Supported Formats

`MP3` · `FLAC` · `WAV` · `AAC` · `OGG` · `M4A` · `WMA` · `OPUS`

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ 
- **npm** v9+
- **Python** 3.x (for native module compilation)
- **Visual Studio Build Tools** (Windows) or **Xcode CLI Tools** (macOS)

### Installation

```bash
# Clone the repository
git clone https://github.com/retronix/music-player.git
cd retronix-music-player

# Install dependencies
npm install

# Rebuild native modules (better-sqlite3)
npm run rebuild

# Start in development mode
npm run dev
```

---

## 🏗️ Architecture

```
retronix-music-player/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.js             # App entry, window management
│   │   ├── ipcHandlers.js       # IPC channel handlers
│   │   ├── trayManager.js       # System tray
│   │   ├── mediaKeys.js         # Global media key shortcuts
│   │   ├── libraryScanner.js    # File scanning & metadata extraction
│   │   └── database/
│   │       └── db.js            # SQLite schema, queries, migrations
│   ├── preload/
│   │   └── index.js             # Secure contextBridge API
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── App.jsx           # Root component
│           ├── engine/
│           │   ├── AudioEngine.js   # Web Audio API engine
│           │   └── Visualizer.js    # Canvas visualizers
│           ├── store/
│           │   ├── PlayerStore.jsx  # Playback state (Context + Reducer)
│           │   └── LibraryStore.jsx # Library state
│           ├── components/
│           │   ├── TopBar.jsx
│           │   ├── Sidebar.jsx
│           │   ├── PlaybackConsole.jsx
│           │   ├── LibraryView.jsx
│           │   ├── EqualizerPanel.jsx
│           │   ├── VisualizerPanel.jsx
│           │   ├── PlaylistsPanel.jsx
│           │   ├── QueuePanel.jsx
│           │   ├── SettingsPanel.jsx
│           │   └── UIComponents.jsx
│           └── utils/
│               ├── themes.js        # Dark/Light theme tokens
│               └── helpers.js       # Utility functions
├── resources/                   # Icons, assets
├── electron.vite.config.js      # Build config
└── package.json
```

---

## 🔌 IPC API

The preload script exposes `window.electronAPI` with the following namespaces:

```js
window.electronAPI.window   // minimize, maximize, close
window.electronAPI.settings // get, set, getAll, reset
window.electronAPI.library  // getAllTracks, search, scan, toggleFavorite...
window.electronAPI.playlist // getAll, create, delete, addTrack, export...
window.electronAPI.audio    // getFilePath, openFile
window.electronAPI.artwork  // get(filePath)
window.electronAPI.tray     // updateTrack, updatePlayState
window.electronAPI.notify   // trackChanged
window.electronAPI.system   // getAppVersion, openExternal, platform
window.electronAPI.on       // event listener (media-key, tray-action, scan:*)
```

---

## 🎚️ Audio Signal Chain

```
File
 └─▶ ArrayBuffer (fetch)
      └─▶ AudioContext.decodeAudioData()
           └─▶ AudioBufferSourceNode
                └─▶ BiquadFilterNode[31Hz]
                     └─▶ BiquadFilterNode[62Hz]
                          └─▶ ... (10 bands)
                               └─▶ BiquadFilterNode[16kHz]
                                    └─▶ GainNode (crossfade)
                                         └─▶ GainNode (volume)
                                              └─▶ AnalyserNode (FFT)
                                                   └─▶ AudioContext.destination
```

---

## 🗄️ Database Schema

SQLite database stored at `%APPDATA%/retronix-music-player/library.db`

**Tables:** `tracks`, `albums`, `artists`, `playlists`, `playlist_tracks`, `play_history`, `library_paths`, `artwork_cache`

Key optimizations:
- WAL journal mode
- Indexed queries on `artist`, `album`, `title`, `plays`, `favorite`
- 256MB mmap for large libraries
- Incremental scanning (skip unchanged files by `last_modified` timestamp)

---

## 🎨 Theme System

Two built-in themes with full neumorphic shadow tokens:

```js
const T = getTheme(isDark)  // Returns theme object with:
// T.bg, T.surface, T.surfaceDeep, T.surfaceRaised
// T.text, T.textMuted, T.accent
// T.shadowDown, T.shadowUp
// T.neumorphOut, T.neumorphIn
// T.lcdBg, T.lcdText, T.vuActive, T.vuWarn, T.vuClip
// T.spectrumTop, T.spectrumBottom, T.eqBar
// T.knobBg, T.knobIndicator
```

---

## 📦 Build & Package

```bash
# Build renderer + main
npm run build

# Package for current platform
npm run package

# Package for specific platforms
npm run package:win    # Windows NSIS + portable
npm run package:mac    # macOS DMG + zip
npm run package:linux  # Linux AppImage + deb
```

Output → `dist/`

---

## ⚡ Performance

| Metric | Target | Notes |
|---|---|---|
| Startup time | < 3s | Lazy library loading |
| Memory usage | < 300MB | Virtualized lists |
| Visualizer FPS | 60 fps | requestAnimationFrame |
| Library size | 100K tracks | SQLite WAL + indexes |
| Artwork cache | Unlimited | Hash-deduped JPEGs |

---

## 🛠️ Development

```bash
npm run dev        # Start with hot-reload
npm run lint       # ESLint
```

DevTools open automatically in dev mode.

---

## 📜 License

MIT License — see [LICENSE](LICENSE)

---

*Retronix MK·II — Your music, your hardware, your signal chain.*
