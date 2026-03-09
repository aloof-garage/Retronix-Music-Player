# Retronix MK·II — Desktop Music Player

A skeuomorphic Hi-Fi desktop music player built with Electron 29, React 18, and the Web Audio API.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18–22 | **Node 24 works too** |
| npm | 9+ | bundled with Node |

> **No C++ compiler or Visual Studio required.** All SQLite access uses `node-sqlite3-wasm` (pure WebAssembly).

---

## Quick Start

```bash
# 1. Clone / extract the project
cd retronix-music-player

# 2. Install dependencies (no native compilation needed)
npm install

# 3. Start in development mode
npm run dev
```

The app window will open automatically. Dev Tools open in a detached window.

---

## Adding Music

Three ways to add songs:

### A — Add a folder (recommended)
1. Go to **Settings** (gear icon, top-right) → **Music Library**
2. Click **+ ADD FOLDER** and pick your music directory
3. The library scans automatically — progress shows in the sidebar

Or click **+ ADD FOLDER** on the empty library screen.

### B — Import individual files
1. Click **⇩ IMPORT FILES** (Settings or empty library screen)
2. Select one or more `.mp3 / .flac / .wav / .aac / .ogg / .m4a` files
3. They appear in the library immediately

### C — Drag & drop / file association
- Pass a file path on the command line: `retronix-music-player song.mp3`
- Double-click an associated audio file (after building the installer)

---

## Playing Music

- **Double-click** any track in the library to play it
- The full album/playlist becomes the queue automatically
- **Prev / Play / Pause / Next** buttons in the bottom bar
- **Drag** the progress slider to seek
- **Drag** the Volume knob up/down to change volume
- **Bass / Mid / Treble** mini-knobs provide quick EQ

---

## Playlists

1. Navigate to **Playlists** in the sidebar
2. Click **+ NEW** to create a playlist
3. Right-click tracks in the library (or use the menu) to add them
4. **⇩ IMPORT** imports an `.m3u` / `.m3u8` file
5. **⇑ EXPORT** saves the selected playlist as `.m3u8`

---

## Building a Distributable

```bash
# Windows installer + portable exe
npm run package:win

# macOS dmg + zip
npm run package:mac

# Linux AppImage + deb
npm run package:linux
```

Outputs land in the `dist/` folder.

---

## Architecture

```
src/
├── main/                   Electron main process
│   ├── index.js            App bootstrap, protocol registration, window
│   ├── ipcHandlers.js      All IPC channel handlers
│   ├── libraryScanner.js   Recursive file scanner + metadata extraction
│   ├── mediaKeys.js        Global media key shortcuts
│   ├── trayManager.js      System tray icon + menu
│   └── database/
│       └── db.js           SQLite via node-sqlite3-wasm
├── preload/
│   └── index.js            contextBridge — exposes window.electronAPI
└── renderer/src/
    ├── App.jsx             Root component + settings persistence
    ├── engine/
    │   ├── AudioEngine.js  Web Audio API engine (EQ, analyser, seek)
    │   └── Visualizer.js   Canvas visualizer (5 modes)
    ├── store/
    │   ├── PlayerStore.jsx React context — playback state + actions
    │   └── LibraryStore.jsx React context — library + playlists
    └── components/         UI components (all inline styles, no CSS files)
```

### Audio Loading

Files are read in the **main process** via `fs.readFileSync` and transferred to the renderer as base64 over IPC. The renderer decodes `base64 → ArrayBuffer → AudioBuffer` using the Web Audio API. This approach:

- Bypasses all CSP restrictions
- Works with any local path (including Windows `C:\...`)
- Requires no special protocol configuration

### Signal Chain

```
BufferSourceNode → EQ[10×BiquadFilter] → GainNode → MasterGain → AnalyserNode → AudioDestination
```

---

## Supported Formats

`mp3` · `flac` · `wav` · `aac` · `ogg` · `m4a` · `wma` · `opus`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails | Make sure you are using Node 18–24. Run `node -v` to check. |
| Library stays empty after scan | Check the console (DevTools) for `[Scanner]` log lines. Verify the folder path exists and contains supported audio files. |
| `electron-vite` not found | Run `npm install` again; it installs to `node_modules/.bin/`. Use `npx electron-vite dev` if the PATH is not set. |
| Audio won't play | Open DevTools console and look for `[AudioEngine]` errors. Confirm the file exists at the path shown in the error. |
| Window doesn't appear | The app uses a frameless window — look in the taskbar/dock. |

