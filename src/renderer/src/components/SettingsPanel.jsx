import { useState, useEffect } from 'react'
import { HWButton, ToggleSwitch } from './UIComponents'
import { useLibrary } from '../store/LibraryStore'
import { usePlayer } from '../store/PlayerStore'

export function SettingsPanel({ theme: T, darkMode, onToggleDark, visualizerType, onVisualizerChange }) {
  const { state, addLibraryPath, removeLibraryPath, scanLibrary, importFiles, importPlaylist } = useLibrary()
  const { state: playerState, setCrossfadeTime } = usePlayer()
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [settings, setSettings] = useState({
    minimizeToTray: true,
    startMinimized: false,
    crossfade: 0,
    gapless: true,
    notifications: true,
  })

  useEffect(() => {
    window.electronAPI?.system.getAppVersion().then(v => setAppVersion(v || '1.0.0'))
    window.electronAPI?.settings.getAll().then(all => {
      if (all) {
        setSettings(s => ({
          ...s,
          minimizeToTray: all.minimizeToTray ?? true,
          startMinimized: all.startMinimized ?? false,
          crossfade: all.playback?.crossfade ?? 0,
          gapless: all.playback?.gapless ?? true,
        }))
      }
    })
  }, [])

  // Keep local crossfade in sync with player state
  useEffect(() => {
    setSettings(s => ({ ...s, crossfade: playerState.crossfadeTime ?? 0 }))
  }, [playerState.crossfadeTime])

  const saveSetting = (key, value) => window.electronAPI?.settings.set(key, value)

  const handleToggle = (key, value) => {
    setSettings(s => ({ ...s, [key]: value }))
    saveSetting(key, value)
  }

  const handleCrossfadeChange = (v) => {
    const sec = Number(v)
    setSettings(s => ({ ...s, crossfade: sec }))
    setCrossfadeTime(sec)
  }

  const VIZ_OPTIONS = [
    { id: 'spectrum',     label: 'Spectrum Analyzer' },
    { id: 'waveform',     label: 'Waveform' },
    { id: 'led_bars',     label: 'LED Bars' },
    { id: 'circular',     label: 'Circular Spectrum' },
    { id: 'oscilloscope', label: 'Oscilloscope' },
  ]

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
      <div style={{ maxWidth: 600 }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 18, letterSpacing: '0.15em', color: T.text }}>SETTINGS</h2>

        {/* Library */}
        <SettingsSection title="MUSIC LIBRARY" theme={T}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.1em', marginBottom: 8 }}>LIBRARY PATHS</div>
            {state.libraryPaths.length === 0 ? (
              <div style={{ fontSize: 11, color: T.textMuted, padding: '8px 0' }}>No folders added yet</div>
            ) : (
              state.libraryPaths.map(p => (
                <div key={p.path} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 6, background: T.surfaceDeep,
                  boxShadow: T.neumorphIn, border: `1px solid ${T.border}`, marginBottom: 6,
                }}>
                  <span style={{ fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, marginRight: 8 }}>{p.path}</span>
                  <button onClick={() => removeLibraryPath(p.path)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 14 }}>×</button>
                </div>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <HWButton theme={T} onClick={addLibraryPath}>+ ADD FOLDER</HWButton>
            <HWButton theme={T} onClick={() => importFiles()}>⇩ IMPORT FILES</HWButton>
            <HWButton theme={T} onClick={() => scanLibrary()} active={state.scanning}>
              {state.scanning ? '⟳ SCANNING…' : '⟳ SCAN NOW'}
            </HWButton>
          </div>
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title="APPEARANCE" theme={T}>
          <SettingsRow label="Theme" theme={T}>
            <div style={{ display: 'flex', gap: 8 }}>
              <HWButton size="sm" theme={T} active={darkMode}  onClick={() => !darkMode && onToggleDark()}>DARK</HWButton>
              <HWButton size="sm" theme={T} active={!darkMode} onClick={() => darkMode  && onToggleDark()}>LIGHT</HWButton>
            </div>
          </SettingsRow>
          <SettingsRow label="Visualizer" theme={T}>
            <select value={visualizerType} onChange={e => onVisualizerChange(e.target.value)}
              style={{ background: T.surfaceDeep, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', boxShadow: T.neumorphIn }}>
              {VIZ_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </SettingsRow>
        </SettingsSection>

        {/* Playback */}
        <SettingsSection title="PLAYBACK" theme={T}>
          <SettingsRow label="Gapless Playback" theme={T}>
            <ToggleSwitch active={settings.gapless} onChange={v => handleToggle('gapless', v)} theme={T}/>
          </SettingsRow>
          <SettingsRow label="Crossfade Duration" theme={T}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="range" min={0} max={10} step={1} value={settings.crossfade}
                onChange={e => handleCrossfadeChange(e.target.value)}
                style={{ width: 120, accentColor: T.accent }}
              />
              <span style={{ fontSize: 12, color: T.accent, fontWeight: 700, minWidth: 28 }}>
                {settings.crossfade === 0 ? 'OFF' : `${settings.crossfade}s`}
              </span>
            </div>
          </SettingsRow>
        </SettingsSection>

        {/* System */}
        <SettingsSection title="SYSTEM" theme={T}>
          <SettingsRow label="Minimize to Tray" theme={T}>
            <ToggleSwitch active={settings.minimizeToTray} onChange={v => handleToggle('minimizeToTray', v)} theme={T}/>
          </SettingsRow>
          <SettingsRow label="Start Minimized" theme={T}>
            <ToggleSwitch active={settings.startMinimized} onChange={v => handleToggle('startMinimized', v)} theme={T}/>
          </SettingsRow>
          <SettingsRow label="Desktop Notifications" theme={T}>
            <ToggleSwitch active={settings.notifications} onChange={v => setSettings(s => ({ ...s, notifications: v }))} theme={T}/>
          </SettingsRow>
        </SettingsSection>

        {/* About — no MK·II */}
        <SettingsSection title="ABOUT" theme={T}>
          <div style={{ display: 'flex', gap: 40 }}>
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.12em', marginBottom: 4 }}>APPLICATION</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: '0.25em' }}>RETRONIX</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Music Player</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.12em', marginBottom: 4 }}>VERSION</div>
              <div style={{ fontSize: 14, color: T.text }}>v{appVersion}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.12em', marginBottom: 4 }}>PLATFORM</div>
              <div style={{ fontSize: 12, color: T.text }}>
                {typeof process !== 'undefined' ? process.platform : 'web'}
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}

function SettingsSection({ title, children, theme: T }) {
  return (
    <div style={{ marginBottom: 24, borderRadius: 12, padding: 20, background: T.surfaceDeep, boxShadow: T.neumorphIn, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, letterSpacing: '0.2em', color: T.textMuted, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function SettingsRow({ label, children, theme: T }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}22` }}>
      <span style={{ fontSize: 11, color: T.text, letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </div>
  )
}
