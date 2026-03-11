import { useState } from 'react'

export function TopBar({ theme: T, searchQuery, onSearch, darkMode, onToggleDark, onConfig }) {
  const [maximized, setMaximized] = useState(false)

  const handleMaximize = async () => {
    if (window.electronAPI) {
      const isMax = await window.electronAPI.window.maximize()
      setMaximized(isMax)
    }
  }

  return (
    <div style={{
      height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', background: T.surface,
      boxShadow: `0 2px 8px ${T.shadowDown}, 0 1px 0 ${T.shadowUp}`,
      borderBottom: `1px solid ${T.border}`, flexShrink: 0, zIndex: 100,
      WebkitAppRegion: 'drag',
    }}>

      {/* Logo — no "MK·II" */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, WebkitAppRegion: 'no-drag' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, #f0a070, ${T.accent})`,
          boxShadow: `0 0 8px ${T.accent}66, 2px 2px 5px ${T.shadowDown}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>◈</div>
        <span style={{ fontSize: 13, letterSpacing: '0.25em', fontWeight: 700, color: T.accent }}>
          RETRONIX
        </span>
      </div>

      {/* Center controls */}
      <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
          borderRadius: 6, background: T.surfaceDeep, boxShadow: T.neumorphIn,
          border: `1px solid ${T.border}`,
        }}>
          <span style={{ color: T.textMuted, fontSize: 12 }}>⊕</span>
          <input
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder="search library..."
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: T.text, fontSize: 11, width: 160, letterSpacing: '0.05em',
              caretColor: T.accent, fontFamily: 'inherit',
            }}
          />
          {searchQuery && (
            <button onClick={() => onSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 14, padding: 0, lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>

        {/* Theme toggle */}
        <button onClick={onToggleDark} style={{
          background: T.surfaceRaised, border: `1px solid ${T.border}`, borderRadius: 6,
          padding: '4px 12px', cursor: 'pointer', color: T.text, fontSize: 11,
          letterSpacing: '0.1em', boxShadow: T.neumorphOut, fontFamily: 'inherit',
        }}>
          {darkMode ? '◑ LIGHT' : '● DARK'}
        </button>

        {/* Config */}
        <button onClick={onConfig} style={{
          background: T.surfaceRaised, border: `1px solid ${T.border}`, borderRadius: 6,
          padding: '4px 12px', cursor: 'pointer', color: T.textMuted, fontSize: 11,
          boxShadow: T.neumorphOut, fontFamily: 'inherit',
        }}>⚙ CONFIG</button>
      </div>

      {/* Frameless window controls */}
      <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' }}>
        <WindowBtn onClick={() => window.electronAPI?.window.minimize()} color="#ffbd2e">─</WindowBtn>
        <WindowBtn onClick={handleMaximize} color="#28c940">{maximized ? '❐' : '□'}</WindowBtn>
        <WindowBtn onClick={() => window.electronAPI?.window.close()} color="#ff5f56">✕</WindowBtn>
      </div>
    </div>
  )
}

function WindowBtn({ children, onClick, color }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 16, height: 16, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: hover ? color : 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: hover ? '#000' : 'transparent',
        transition: 'all 0.15s',
      }}>
      {children}
    </button>
  )
}
