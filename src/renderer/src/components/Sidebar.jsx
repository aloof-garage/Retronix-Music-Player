import { useLibrary } from '../store/LibraryStore'
import { formatTime } from '../utils/helpers'

const NAV_ITEMS = [
  { id: 'library',   icon: '♫', label: 'Library'   },
  { id: 'artists',   icon: '◎', label: 'Artists'   },
  { id: 'albums',    icon: '▣', label: 'Albums'    },
  { id: 'playlists', icon: '≡', label: 'Playlists' },
  { id: 'favorites', icon: '♥', label: 'Favorites' },
  { id: 'recent',    icon: '↺', label: 'Recent'    },
  { id: 'queue',     icon: '⊞', label: 'Queue'     },
  { id: 'eq',        icon: '≋', label: 'Equalizer' },
  { id: 'settings',  icon: '⚙', label: 'Settings'  },
]

export function Sidebar({ activeSection, onNavigate, theme: T }) {
  const { state } = useLibrary()
  const stats = state.stats || {}
  const trackCount = stats.total_tracks || state.tracks.length
  const albumCount = stats.total_albums || 0
  const artistCount = stats.total_artists || 0
  const totalDuration = stats.total_duration || state.tracks.reduce((a, t) => a + (t.duration || 0), 0)

  return (
    <div style={{
      width: 180, flexShrink: 0, background: T.surface, display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${T.border}`, padding: '16px 10px',
      boxShadow: `2px 0 8px ${T.shadowDown}`,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: '0.18em', color: T.textMuted,
        marginBottom: 10, paddingLeft: 8,
      }}>
        NAVIGATION
      </div>

      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
            marginBottom: 2, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: activeSection === item.id ? T.surfaceDeep : 'transparent',
            color: activeSection === item.id ? T.accent : T.textMuted,
            boxShadow: activeSection === item.id ? T.neumorphIn : 'none',
            fontSize: 12, letterSpacing: '0.1em', textAlign: 'left',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{item.icon}</span>
          <span>{item.label}</span>
          {activeSection === item.id && (
            <span style={{ marginLeft: 'auto', width: 3, height: 16, background: T.accent, borderRadius: 2 }}/>
          )}
        </button>
      ))}

      {/* Library stats */}
      <div style={{ marginTop: 'auto', padding: '10px 8px' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.textMuted, marginBottom: 8 }}>
          LIBRARY STATS
        </div>
        {[
          ['TRACKS', trackCount],
          ['ALBUMS', albumCount],
          ['ARTISTS', artistCount],
          ['RUNTIME', formatTime(totalDuration)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11 }}>
            <span style={{ color: T.textMuted }}>{k}</span>
            <span style={{ color: T.text }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Scan indicator */}
      {state.scanning && (
        <div style={{
          padding: '8px', borderRadius: 6, background: T.surfaceDeep,
          border: `1px solid ${T.accent}44`, marginTop: 8,
        }}>
          <div style={{ fontSize: 10, color: T.accent, letterSpacing: '0.1em', marginBottom: 4 }}>
            SCANNING...
          </div>
          {state.scanProgress && (
            <>
              <div style={{
                height: 3, borderRadius: 2, background: T.surfaceDeep,
                overflow: 'hidden', boxShadow: T.neumorphIn,
              }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: T.accent,
                  width: `${state.scanProgress.percent || 0}%`,
                  transition: 'width 0.3s',
                }}/>
              </div>
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 3 }}>
                {state.scanProgress.current || 0}/{state.scanProgress.total || 0}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
