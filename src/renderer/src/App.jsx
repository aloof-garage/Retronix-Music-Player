import { useState, useEffect, useCallback } from 'react'
import { PlayerProvider, usePlayer } from './store/PlayerStore'
import { LibraryProvider, useLibrary } from './store/LibraryStore'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { PlaybackConsole } from './components/PlaybackConsole'
import { LibraryView, AlbumsView, ArtistsView } from './components/LibraryView'
import { EqualizerPanel } from './components/EqualizerPanel'
import { VisualizerPanel } from './components/VisualizerPanel'
import { PlaylistsPanel } from './components/PlaylistsPanel'
import { QueuePanel } from './components/QueuePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { getTheme } from './utils/themes'

const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

function AppInner() {
  const [darkMode,       setDarkMode]       = useState(true)
  const [activeSection,  setActiveSection]  = useState('library')
  const [searchQuery,    setSearchQuery]    = useState('')
  const [eqValues,       setEqValues]       = useState(Object.fromEntries(EQ_BANDS.map(f => [f, 0])))
  const [eqEnabled,      setEqEnabled]      = useState(true)
  const [visualizerType, setVisualizerType] = useState('spectrum')

  const T = getTheme(darkMode)
  const { toggleFavorite, search, importFiles, loadLibrary } = useLibrary()
  const { setEqBand, getEngine, playTrack } = usePlayer()

  // ── Load persisted settings ────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.settings.getAll().then(s => {
      if (!s) return
      if (s.theme)                        setDarkMode(s.theme === 'dark')
      if (s.equalizer?.bands)             setEqValues(s.equalizer.bands)
      if (s.equalizer?.enabled != null)   setEqEnabled(s.equalizer.enabled)
      if (s.visualizer?.type)             setVisualizerType(s.visualizer.type)
      if (s.lastSection)                  setActiveSection(s.lastSection)
    })
  }, [])

  // ── Media keys / tray actions ──────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return
    const unsubs = [
      window.electronAPI.on('media-key',  (action) => window.dispatchEvent(new CustomEvent('retronix-media-key', { detail: action }))),
      window.electronAPI.on('tray-action',(action) => window.dispatchEvent(new CustomEvent('retronix-media-key', { detail: action }))),
      window.electronAPI.on('open-file', async (filePath) => {
        await importFiles([filePath])
        await loadLibrary()
      }),
    ]
    return () => unsubs.forEach(u => u?.())
  }, [importFiles, loadLibrary])

  // ── Persist settings ───────────────────────────────────────────────────────
  useEffect(() => { window.electronAPI?.settings.set('theme', darkMode ? 'dark' : 'light') }, [darkMode])
  useEffect(() => { window.electronAPI?.settings.set('lastSection', activeSection) }, [activeSection])
  useEffect(() => { window.electronAPI?.settings.set('equalizer', { enabled: eqEnabled, bands: eqValues }) }, [eqEnabled, eqValues])
  useEffect(() => { window.electronAPI?.settings.set('visualizer', { type: visualizerType }) }, [visualizerType])

  // ── EQ ─────────────────────────────────────────────────────────────────────
  const handleEqChange = useCallback((freq, gain) => {
    setEqValues(prev => ({ ...prev, [freq]: gain }))
    setEqBand(freq, gain)
  }, [setEqBand])

  const handleEqToggle = useCallback((enabled) => {
    setEqEnabled(enabled)
    getEngine()?.setEqEnabled(enabled)
  }, [getEngine])

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearch = useCallback((query) => {
    setSearchQuery(query)
    search(query)
  }, [search])

  // ── Content router ─────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (activeSection) {
      case 'library':
      case 'favorites':
      case 'recent':
        return <LibraryView theme={T} section={activeSection}/>
      case 'albums':
        return <AlbumsView theme={T}/>
      case 'artists':
        return <ArtistsView theme={T}/>
      case 'playlists':
        return <PlaylistsPanel theme={T}/>
      case 'queue':
        return <QueuePanel theme={T}/>
      case 'eq':
        return <EqualizerPanel theme={T} eqValues={eqValues} onEqChange={handleEqChange} enabled={eqEnabled} onToggle={handleEqToggle}/>
      case 'visualizer':
        return <VisualizerPanel theme={T} vizType={visualizerType} onVizTypeChange={setVisualizerType}/>
      case 'settings':
        return <SettingsPanel theme={T} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} visualizerType={visualizerType} onVisualizerChange={setVisualizerType}/>
      default:
        return <LibraryView theme={T} section="library"/>
    }
  }

  return (
    <div style={{ fontFamily: "'Courier New', 'Lucida Console', monospace", background: T.bg, height: '100vh', display: 'flex', flexDirection: 'column', color: T.text, overflow: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.scrollThumb}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.textMuted}; }
        input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; }
        @keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        body { -webkit-app-region: no-drag; }
      `}</style>

      <TopBar theme={T} searchQuery={searchQuery} onSearch={handleSearch} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} onConfig={() => setActiveSection('settings')}/>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar theme={T} activeSection={activeSection} onNavigate={setActiveSection}/>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {renderContent()}
        </div>
      </div>

      <PlaybackConsole theme={T} onToggleFav={toggleFavorite} eqValues={eqValues} onEqChange={handleEqChange}/>
    </div>
  )
}

function MediaKeyBridge() {
  const { togglePlay, nextTrack, prevTrack } = usePlayer()
  useEffect(() => {
    const handler = (e) => {
      switch (e.detail) {
        case 'toggle-play': togglePlay(); break
        case 'next-track':  nextTrack();  break
        case 'prev-track':  prevTrack();  break
        default: break
      }
    }
    window.addEventListener('retronix-media-key', handler)
    return () => window.removeEventListener('retronix-media-key', handler)
  }, [togglePlay, nextTrack, prevTrack])
  return null
}

export default function App() {
  return (
    <PlayerProvider>
      <LibraryProvider>
        <MediaKeyBridge/>
        <AppInner/>
      </LibraryProvider>
    </PlayerProvider>
  )
}
