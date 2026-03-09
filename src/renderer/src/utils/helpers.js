// ── Time formatting ────────────────────────────────────────────────────────────
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) {
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  }
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

// ── Format file size ──────────────────────────────────────────────────────────
export function formatFileSize(bytes) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let val = bytes
  let unit = 0
  while (val >= 1024 && unit < units.length - 1) { val /= 1024; unit++ }
  return `${val.toFixed(1)} ${units[unit]}`
}

// ── Format duration total ─────────────────────────────────────────────────────
export function formatTotalDuration(seconds) {
  if (!seconds) return '0 min'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

// ── Deterministic color from string ──────────────────────────────────────────
export function colorFromString(str) {
  const colors = [
    '#e8834a', '#6b8dd6', '#7ed4a0', '#c478d4',
    '#d4a478', '#78c4d4', '#d478a4', '#a4d478',
    '#7a78d4', '#d4d478', '#78d4a4', '#d47878'
  ]
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// ── Shuffle array ────────────────────────────────────────────────────────────
export function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Clamp value ──────────────────────────────────────────────────────────────
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

// ── Debounce ──────────────────────────────────────────────────────────────────
export function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// ── Check if Electron ─────────────────────────────────────────────────────────
export function isElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI
}
