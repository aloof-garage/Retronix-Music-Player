# Retronix MK·II — Desktop Music Player

Skeuomorphic Hi-Fi desktop music player built with Electron 29, React 18, and the Web Audio API.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 – 22 (any LTS) |
| npm | bundled with Node |

> **No C++ build tools, no native modules.** All data storage uses `electron-store` (pure JSON). No SQLite, no WASM.

---

## Setup

```bash
# 1. Enter the project folder
cd retronix-music-player

# 2. Install dependencies  (~30 seconds, pure JS packages)
npm install

# 3. Launch in development mode
npm run dev
```

The window opens automatically. DevTools launch in a detached pane.

---

## Adding Music

### Option A — Add a folder (scans automatically)
Click **+ ADD FOLDER** (visible on the empty library screen, or in **Settings → Music Library**).  
The folder is registered and a scan starts immediately — progress shows in the sidebar.

### Option B — Import individual files
Click **⇩ IMPORT FILES** on the empty library screen or in Settings.  
Pick one or more `.mp3 / .flac / .wav / .aac / .ogg / .m4a` files.

### Option C — Drag audio files onto the window
Drop audio files directly onto the app window to import and play them.

---

## Playing Music

- **Double-click** any track to play it (the rest of the list becomes the queue)
- **⏮ / ▶⏸ / ⏭** transport buttons in the bottom bar
- **Drag** the progress slider to seek
- **Drag** the Volume knob (up = louder, down = quieter)

---

## Equalizer

Navigate to **Equalizer** in the sidebar.

- **Drag each band slider up/down** (−12 dB to +12 dB)
- Choose a **preset** (FLAT, BASS+, ROCK, POP, JAZZ, etc.)
- The **EQ ON** toggle bypasses the EQ without losing your settings
- The mini **Bass / Mid / Treble** knobs in the bottom bar give quick access

---

## Building a Distributable

```bash
npm run package:win    # Windows — NSIS installer + portable exe
npm run package:mac    # macOS   — DMG + ZIP
npm run package:linux  # Linux   — AppImage + DEB
```

Output goes to the `dist/` folder.

---

## Architecture

```
src/
├── main/
│   ├── index.js            Bootstrap, protocol registration, window
│   ├── ipcHandlers.js      All IPC channel handlers (library, audio, playlists…)
│   ├── libraryScanner.js   Recursive file glob + music-metadata extraction
│   ├── mediaKeys.js        Global media key shortcuts
│   ├── trayManager.js      System tray icon + menu
│   └── database/
│       └── db.js           electron-store JSON library (zero native deps)
├── preload/
│   └── index.js            contextBridge → window.electronAPI
└── renderer/src/
    ├── App.jsx
    ├── engine/
    │   ├── AudioEngine.js  Web Audio API (10-band EQ, analyser, seek)
    │   └── Visualizer.js   Canvas visualizer (5 modes)
    ├── store/
    │   ├── PlayerStore.jsx Playback state + actions
    │   └── LibraryStore.jsx Library + playlists
    └── components/         All UI (inline styles, no CSS files)
```

### Data Storage

All library data (tracks, playlists, play history, paths) is stored as JSON in:
- **Windows**: `%APPDATA%\retronix-music-player\library.json`
- **macOS**:   `~/Library/Application Support/retronix-music-player/library.json`
- **Linux**:   `~/.config/retronix-music-player/library.json`

### Audio Loading

Files are read by the **main process** (`fs.readFileSync`) and sent to the renderer as base64 over IPC.  
The renderer decodes `base64 → ArrayBuffer → AudioBuffer` using the Web Audio API.  
This bypasses all CSP restrictions and works with any local path.

### Audio Signal Chain

```
BufferSource → EQ[10 × BiquadFilter] → GainNode → MasterGain → Analyser → AudioDestination
```

---

## Supported Formats

`mp3` · `flac` · `wav` · `aac` · `ogg` · `m4a` · `wma` · `opus`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails | Check Node version: `node -v` must be 18–22 |
| Library stays empty after scan | Open DevTools (auto-opens in dev mode) → Console tab → look for `[Scanner]` logs |
| EQ sliders don't respond | Click the **EQ ON** toggle to make sure it's on. Drag sliders up/down, not left/right. |
| Audio won't play | DevTools console → look for `[AudioEngine]` errors. Confirm the file path exists. |
| Window not visible | App uses a frameless window — check the taskbar/dock. |

