// ── Retronix Audio Engine ──────────────────────────────────────────────────────
// Signal chain:  source → gainNode → EQ[10] → masterGain → analyser → dest
// Crossfade:  nextSource → nextGain ─┐
//             current gainNode ──────┴→ EQ[0] (Web Audio sums inputs)

const EQ_BANDS  = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const CACHE_MAX = 6   // keep last N decoded AudioBuffers in memory

export class AudioEngine {
  constructor() {
    this.audioContext    = null
    this.currentSource  = null
    this.gainNode       = null
    this.masterGainNode = null
    this.analyserNode   = null
    this.eqNodes        = []

    this.currentBuffer  = null
    this.startTime      = 0
    this.pauseOffset    = 0
    this.isPlaying      = false
    this.duration       = 0

    this.volume         = 0.75
    this.eqEnabled      = true
    this.eqGains        = Object.fromEntries(EQ_BANDS.map(f => [f, 0]))
    this.crossfadeTime  = 0

    // LRU decoded-buffer cache
    this._cache         = new Map()   // filePath → AudioBuffer
    this._cacheKeys     = []          // LRU order

    // Crossfade / preload
    this._preloadedBuffer   = null
    this._preloadTriggered  = false
    this._crossfadeStarted  = false

    this.onEnded          = null
    this.onTimeUpdate     = null
    this.onError          = null
    this.onBufferLoaded   = null
    this.onNearEnd        = null
    this.onCrossfadeStart = null

    this._timerId = null
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  async init() {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume()
      return
    }
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' })
    this._buildChain()
  }

  _buildChain() {
    const ctx = this.audioContext

    this.eqNodes = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.41
      f.gain.value = this.eqEnabled ? (this.eqGains[freq] || 0) : 0
      return f
    })
    for (let i = 0; i < this.eqNodes.length - 1; i++) this.eqNodes[i].connect(this.eqNodes[i + 1])

    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 1.0
    this.gainNode.connect(this.eqNodes[0])

    this.masterGainNode = ctx.createGain()
    this.masterGainNode.gain.value = this.volume

    this.analyserNode = ctx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.82
    this.analyserNode.minDecibels = -90
    this.analyserNode.maxDecibels = -10

    this.eqNodes[this.eqNodes.length - 1].connect(this.masterGainNode)
    this.masterGainNode.connect(this.analyserNode)
    this.analyserNode.connect(ctx.destination)
  }

  // ── File loading / cache ──────────────────────────────────────────────────────
  async loadFile(filePath) {
    await this.init()

    if (this._cache.has(filePath)) {
      const buf = this._cache.get(filePath)
      this._lruTouch(filePath)
      this.currentBuffer = buf
      this.duration = buf.duration
      this.onBufferLoaded?.(buf.duration)
      return buf
    }

    try {
      const ab  = await this._readFileAsAB(filePath)
      const buf = await this.audioContext.decodeAudioData(ab)
      this._lruPut(filePath, buf)
      this.currentBuffer = buf
      this.duration = buf.duration
      this.onBufferLoaded?.(buf.duration)
      return buf
    } catch (err) {
      console.error('[Engine] loadFile error:', filePath, err)
      this.onError?.('Cannot load audio: ' + err.message)
      throw err
    }
  }

  async preloadFile(filePath) {
    if (!filePath) return
    if (this._cache.has(filePath)) { this._preloadedBuffer = this._cache.get(filePath); return }
    try {
      await this.init()
      const ab  = await this._readFileAsAB(filePath)
      const buf = await this.audioContext.decodeAudioData(ab)
      this._lruPut(filePath, buf)
      this._preloadedBuffer = buf
    } catch (err) {
      console.warn('[Engine] preloadFile error:', err.message)
      this._preloadedBuffer = null
    }
  }

  _lruPut(key, buf) {
    if (this._cache.has(key)) { this._lruTouch(key); return }
    if (this._cacheKeys.length >= CACHE_MAX) {
      const oldest = this._cacheKeys.shift()
      this._cache.delete(oldest)
    }
    this._cache.set(key, buf)
    this._cacheKeys.push(key)
  }
  _lruTouch(key) {
    const i = this._cacheKeys.indexOf(key)
    if (i !== -1) { this._cacheKeys.splice(i, 1); this._cacheKeys.push(key) }
  }

  async _readFileAsAB(filePath) {
    // IPC base64 path (Electron, avoids CSP)
    if (window.electronAPI?.audio?.readFileBase64) {
      const b64 = await window.electronAPI.audio.readFileBase64(filePath)
      if (b64) return this._b64ToAB(b64)
      throw new Error('IPC base64 returned null: ' + filePath)
    }
    // Electron retronix:// protocol
    if (window.electronAPI) {
      const r = await fetch('retronix:///' + encodeURIComponent(filePath))
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.arrayBuffer()
    }
    // Dev / web fallback
    const r = await fetch(filePath)
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.arrayBuffer()
  }

  _b64ToAB(b64) {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out.buffer
  }

  // ── Playback ──────────────────────────────────────────────────────────────────
  play(offset = 0) {
    if (!this.currentBuffer) { console.warn('[Engine] play() – no buffer'); return }
    if (this.audioContext.state === 'suspended') this.audioContext.resume()

    this._stopSource(false)

    // Reset per-source gain to 1 (may have been ramped by crossfade)
    this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime)
    this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime)

    const source = this.audioContext.createBufferSource()
    source.buffer = this.currentBuffer
    source.connect(this.gainNode)

    // Reset crossfade tracking
    this._preloadTriggered = false
    this._crossfadeStarted = false
    this._preloadedBuffer  = null

    source.onended = () => {
      if (this.isPlaying && this.currentSource === source) {
        this.isPlaying   = false
        this.pauseOffset = 0
        this._stopTimer()
        this.onEnded?.()
      }
    }

    const safe = Math.max(0, Math.min(offset, this.duration - 0.001))
    this.startTime  = this.audioContext.currentTime - safe
    this.pauseOffset = safe
    source.start(0, safe)
    this.currentSource = source
    this.isPlaying     = true
    this._startTimer()
  }

  pause() {
    if (!this.isPlaying) return
    this.pauseOffset = this.getCurrentTime()
    this._stopSource(true)
    this.isPlaying = false
    this._stopTimer()
  }

  stop() {
    this._stopSource(true)
    this.isPlaying   = false
    this.pauseOffset = 0
    this._stopTimer()
  }

  seek(time) {
    const t = Math.max(0, Math.min(time, this.duration))
    const was = this.isPlaying
    this._stopSource(true)
    this.isPlaying   = false
    this._stopTimer()
    this.pauseOffset = t
    if (was) this.play(t)
    else this.onTimeUpdate?.(t, this.duration)
  }

  // ── Crossfade ─────────────────────────────────────────────────────────────────
  // Called by PlayerStore when onCrossfadeStart fires.
  // Creates a second source path that fades in while current fades out.
  startCrossfade(buffer, fadeTime) {
    if (!buffer || !this.audioContext || !this.isPlaying) return false
    const ctx = this.audioContext
    const now = ctx.currentTime
    const ft  = Math.max(0.05, fadeTime || this.crossfadeTime || 2)

    const nextSource = ctx.createBufferSource()
    nextSource.buffer = buffer

    const nextGain = ctx.createGain()
    nextGain.gain.setValueAtTime(0.001, now)
    nextGain.gain.linearRampToValueAtTime(1, now + ft)

    nextSource.connect(nextGain)
    nextGain.connect(this.eqNodes[0])   // sums with current gainNode → eqNodes[0]
    nextSource.start(0)

    // Fade out current
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
    this.gainNode.gain.linearRampToValueAtTime(0, now + ft)

    const oldSource = this.currentSource
    const oldGain   = this.gainNode

    // Swap references so subsequent play() / seek() / pause() target new source
    this.currentSource   = nextSource
    this.gainNode        = nextGain
    this.currentBuffer   = buffer
    this.duration        = buffer.duration
    this.startTime       = ctx.currentTime
    this.pauseOffset     = 0
    this._crossfadeStarted  = false
    this._preloadTriggered  = false
    this._preloadedBuffer   = null

    nextSource.onended = () => {
      if (this.isPlaying && this.currentSource === nextSource) {
        this.isPlaying   = false
        this.pauseOffset = 0
        this._stopTimer()
        this.onEnded?.()
      }
    }

    // Detach old nodes after fade completes
    const cleanupMs = (ft + 0.5) * 1000
    setTimeout(() => {
      try { oldSource?.stop() } catch (_) {}
      try { oldSource?.disconnect() } catch (_) {}
      try { oldGain?.disconnect() } catch (_) {}
    }, cleanupMs)

    this.onBufferLoaded?.(buffer.duration)
    return true
  }

  setCrossfadeTime(seconds) {
    this.crossfadeTime = Math.max(0, Math.min(10, Number(seconds) || 0))
  }

  // ── EQ / Volume ───────────────────────────────────────────────────────────────
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(100, volume)) / 100
    if (this.masterGainNode && this.audioContext) {
      this.masterGainNode.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.015)
    }
  }

  setEqBand(frequency, gainDb) {
    const freq = Number(frequency)
    this.eqGains[freq] = gainDb
    if (!this.eqEnabled) return
    const idx  = EQ_BANDS.indexOf(freq)
    const node = this.eqNodes[idx]
    if (node && this.audioContext) {
      node.gain.setTargetAtTime(gainDb, this.audioContext.currentTime, 0.015)
    }
  }

  setEqEnabled(enabled) {
    this.eqEnabled = enabled
    if (!this.audioContext || !this.eqNodes.length) return
    EQ_BANDS.forEach((freq, i) => {
      const node = this.eqNodes[i]
      if (node) node.gain.setTargetAtTime(
        enabled ? (this.eqGains[freq] || 0) : 0,
        this.audioContext.currentTime, 0.015
      )
    })
  }

  applyEqPreset(preset) {
    const P = {
      flat:         [0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
      bass_boost:   [8,  6,  4,  2,  0,  0,  0,  0,  0,  0],
      treble_boost: [0,  0,  0,  0,  0,  0,  2,  4,  6,  8],
      rock:         [5,  4,  3,  1,  0, -1,  1,  3,  4,  5],
      pop:          [-1, 0,  2,  4,  3,  0, -1, -1,  0,  0],
      jazz:         [4,  3,  1,  2, -2, -2,  0,  1,  3,  4],
      classical:    [5,  4,  3,  2, -1, -1,  0,  2,  3,  4],
      electronic:   [4,  4,  2,  0, -2,  2,  1,  2,  4,  4],
      vocal:        [-2,-2,  0,  3,  5,  5,  3,  2, -1, -2],
      loudness:     [6,  4,  0,  0, -2,  0,  0,  0,  4,  6],
    }
    const gains = P[preset] || P.flat
    EQ_BANDS.forEach((freq, i) => this.setEqBand(freq, gains[i]))
    return Object.fromEntries(EQ_BANDS.map((f, i) => [f, gains[i]]))
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  getCurrentTime() {
    if (!this.isPlaying || !this.audioContext) return this.pauseOffset
    return Math.min(this.audioContext.currentTime - this.startTime, this.duration || 0)
  }

  _startTimer() {
    this._stopTimer()
    this._timerId = setInterval(() => {
      if (!this.isPlaying) return
      const time = this.getCurrentTime()
      this.onTimeUpdate?.(time, this.duration)

      // ── Crossfade scheduling ──────────────────────────────────────────────
      const cf = this.crossfadeTime
      if (cf > 0 && this.duration > cf + 2) {
        // Preload: fire (cf + 3)s before end, but only once
        if (!this._preloadTriggered && time >= this.duration - cf - 3) {
          this._preloadTriggered = true
          this.onNearEnd?.()
        }
        // Start fade: fire cf seconds before end, but only once
        if (!this._crossfadeStarted && time >= this.duration - cf) {
          this._crossfadeStarted = true
          this.onCrossfadeStart?.()
        }
      }
    }, 80)
  }

  _stopTimer() {
    if (this._timerId) { clearInterval(this._timerId); this._timerId = null }
  }

  _stopSource(resetCrossfade = false) {
    if (this.currentSource) {
      try { this.currentSource.onended = null; this.currentSource.stop(); this.currentSource.disconnect() } catch (_) {}
      this.currentSource = null
    }
    if (resetCrossfade) { this._preloadTriggered = false; this._crossfadeStarted = false }
  }

  destroy() {
    this.stop()
    this._stopTimer()
    try { this.audioContext?.close() } catch (_) {}
    this.audioContext = null
  }
}

let _inst = null
export function getAudioEngine() {
  if (!_inst) _inst = new AudioEngine()
  return _inst
}
