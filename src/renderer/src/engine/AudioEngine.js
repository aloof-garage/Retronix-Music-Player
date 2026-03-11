// ── Retronix Audio Engine ──────────────────────────────────────────────────────
// Web Audio API. Signal chain:
//   source → gainNode(xfade-out) → EQ[10] → masterGain → analyser → dest
// During crossfade a second source feeds directly into EQ[0] (summed):
//   nextSource → nextGain(xfade-in) → EQ[0]  (Web Audio sums multiple inputs)

const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export class AudioEngine {
  constructor() {
    this.audioContext    = null
    this.currentSource  = null
    this.gainNode       = null   // per-source crossfade gain
    this.masterGainNode = null   // master volume (0-1)
    this.analyserNode   = null
    this.eqNodes        = []

    this.currentBuffer  = null
    this.startTime      = 0
    this.pauseOffset    = 0
    this.isPlaying      = false
    this.duration       = 0

    // Stored values – applied when context is first created
    this.volume      = 0.75
    this.eqEnabled   = true
    this.eqGains     = Object.fromEntries(EQ_BANDS.map(f => [f, 0]))
    this.crossfadeTime = 0  // seconds (0 = disabled)

    // Crossfade / preload state
    this._preloadedBuffer   = null
    this._preloadTriggered  = false   // has onNearEnd fired for this track?
    this._crossfadeStarted  = false   // has onCrossfadeStart fired?

    // Callbacks
    this.onEnded          = null
    this.onTimeUpdate     = null
    this.onError          = null
    this.onBufferLoaded   = null
    this.onNearEnd        = null   // fires crossfadeTime+3s before end → preload
    this.onCrossfadeStart = null   // fires crossfadeTime seconds before end

    this._timeUpdateInterval = null
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async init() {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume()
      return
    }
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' })
    this._buildSignalChain()
  }

  _buildSignalChain() {
    const ctx = this.audioContext

    // 10-band EQ
    this.eqNodes = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.41
      f.gain.value = this.eqEnabled ? (this.eqGains[freq] || 0) : 0
      return f
    })
    for (let i = 0; i < this.eqNodes.length - 1; i++) this.eqNodes[i].connect(this.eqNodes[i + 1])

    // Per-source crossfade gain (sits BEFORE EQ so both crossfade paths share EQ)
    // Layout: source → gainNode → EQ[0] → ... → EQ[9] → masterGain → analyser → dest
    // During xfade: nextSource → nextGain → EQ[0]  (Web Audio sums)
    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 1.0
    this.gainNode.connect(this.eqNodes[0])

    this.masterGainNode = ctx.createGain()
    this.masterGainNode.gain.value = this.volume

    this.analyserNode = ctx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    this.analyserNode.minDecibels = -90
    this.analyserNode.maxDecibels = -10

    this.eqNodes[this.eqNodes.length - 1].connect(this.masterGainNode)
    this.masterGainNode.connect(this.analyserNode)
    this.analyserNode.connect(ctx.destination)
  }

  // ── File loading ──────────────────────────────────────────────────────────────
  async loadFile(filePath) {
    await this.init()
    try {
      const ab = await this._readFileAsArrayBuffer(filePath)
      const buf = await this.audioContext.decodeAudioData(ab)
      this.currentBuffer = buf
      this.duration = buf.duration
      this.onBufferLoaded?.(buf.duration)
      return buf
    } catch (err) {
      console.error('[AudioEngine] loadFile error:', filePath, err)
      this.onError?.(`Cannot load audio: ${err.message}`)
      throw err
    }
  }

  // Pre-load a file into _preloadedBuffer (for crossfade)
  async preloadFile(filePath) {
    if (!filePath) return
    try {
      await this.init()
      const ab = await this._readFileAsArrayBuffer(filePath)
      this._preloadedBuffer = await this.audioContext.decodeAudioData(ab)
    } catch (err) {
      console.warn('[AudioEngine] preloadFile error:', filePath, err.message)
      this._preloadedBuffer = null
    }
  }

  async _readFileAsArrayBuffer(filePath) {
    if (window.electronAPI?.audio?.readFileBase64) {
      const b64 = await window.electronAPI.audio.readFileBase64(filePath)
      if (b64) return this._b64ToAB(b64)
      throw new Error('base64 returned null for: ' + filePath)
    }
    if (window.electronAPI) {
      const r = await fetch('retronix:///' + encodeURIComponent(filePath))
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.arrayBuffer()
    }
    const r = await fetch(filePath)
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.arrayBuffer()
  }

  _b64ToAB(b64) {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    return buf.buffer
  }

  // ── Playback ──────────────────────────────────────────────────────────────────
  play(offset = 0) {
    if (!this.currentBuffer) { console.warn('[AudioEngine] play() – no buffer'); return }
    if (this.audioContext.state === 'suspended') this.audioContext.resume()

    this._stopCurrentSource(false)  // stop but don't reset preload flags

    const source = this.audioContext.createBufferSource()
    source.buffer = this.currentBuffer
    source.connect(this.gainNode)

    // Reset crossfade/preload flags for fresh play
    this._preloadTriggered = false
    this._crossfadeStarted = false
    this._preloadedBuffer  = null

    // Restore gainNode to full (it may have been ramped down by crossfade)
    this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime)
    this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime)

    source.onended = () => {
      if (this.isPlaying && this.currentSource === source) {
        this.isPlaying   = false
        this.pauseOffset = 0
        this._stopTimeUpdate()
        this.onEnded?.()
      }
    }

    const safe = Math.max(0, Math.min(offset, this.duration - 0.001))
    this.pauseOffset = safe
    this.startTime   = this.audioContext.currentTime - safe
    source.start(0, safe)
    this.currentSource = source
    this.isPlaying     = true
    this._startTimeUpdate()
  }

  pause() {
    if (!this.isPlaying) return
    this.pauseOffset = this.getCurrentTime()
    this._stopCurrentSource(true)
    this.isPlaying = false
    this._stopTimeUpdate()
  }

  stop() {
    this._stopCurrentSource(true)
    this.isPlaying   = false
    this.pauseOffset = 0
    this._stopTimeUpdate()
  }

  seek(time) {
    const t = Math.max(0, Math.min(time, this.duration))
    const wasPlaying = this.isPlaying
    this._stopCurrentSource(true)
    this.isPlaying   = false
    this._stopTimeUpdate()
    this.pauseOffset = t
    if (wasPlaying) this.play(t)
    else this.onTimeUpdate?.(t, this.duration)
  }

  // ── Crossfade ─────────────────────────────────────────────────────────────────
  // Called by PlayerStore when it's time to transition to the pre-loaded buffer.
  // Creates a second source path that fades in while current fades out.
  startCrossfade(buffer, fadeTime) {
    if (!buffer || !this.audioContext || !this.isPlaying) return false
    const ctx = this.audioContext
    const now = ctx.currentTime
    const ft  = Math.max(0.1, fadeTime || this.crossfadeTime || 3)

    // New source + gain node
    const nextSource = ctx.createBufferSource()
    nextSource.buffer = buffer
    const nextGain = ctx.createGain()
    nextGain.gain.setValueAtTime(0, now)
    nextGain.gain.linearRampToValueAtTime(1, now + ft)

    // nextGain → EQ[0]  (Web Audio sums with existing gainNode → EQ[0])
    nextSource.connect(nextGain)
    nextGain.connect(this.eqNodes[0])
    nextSource.start(0)

    // Fade out current gainNode
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
    this.gainNode.gain.linearRampToValueAtTime(0, now + ft)

    const oldSource = this.currentSource
    const oldGain   = this.gainNode

    // Swap state immediately so time-tracking and onEnded reflect new track
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
        this._stopTimeUpdate()
        this.onEnded?.()
      }
    }

    // Kill old source after fade completes
    setTimeout(() => {
      try { oldSource?.stop(); oldSource?.disconnect() } catch (_) {}
      try { oldGain?.disconnect() } catch (_) {}
    }, (ft + 0.3) * 1000)

    this.onBufferLoaded?.(buffer.duration)
    return true
  }

  setCrossfadeTime(seconds) {
    this.crossfadeTime = Math.max(0, Math.min(10, seconds || 0))
  }

  // ── EQ ────────────────────────────────────────────────────────────────────────
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(volume, 100)) / 100
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
      if (!node) return
      node.gain.setTargetAtTime(
        enabled ? (this.eqGains[freq] || 0) : 0,
        this.audioContext.currentTime, 0.015
      )
    })
  }

  applyEqPreset(preset) {
    const PRESETS = {
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
    const gains = PRESETS[preset] || PRESETS.flat
    EQ_BANDS.forEach((freq, i) => this.setEqBand(freq, gains[i]))
    return Object.fromEntries(EQ_BANDS.map((f, i) => [f, gains[i]]))
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  getCurrentTime() {
    if (!this.isPlaying || !this.audioContext) return this.pauseOffset
    return Math.min(this.audioContext.currentTime - this.startTime, this.duration || 0)
  }

  _startTimeUpdate() {
    this._stopTimeUpdate()
    this._timeUpdateInterval = setInterval(() => {
      if (!this.isPlaying) return
      const time = this.getCurrentTime()
      this.onTimeUpdate?.(time, this.duration)

      // Near-end: fire preload trigger crossfadeTime + 3s before end
      if (this.crossfadeTime > 0 && !this._preloadTriggered
          && this.duration > 0 && time >= this.duration - this.crossfadeTime - 3) {
        this._preloadTriggered = true
        this.onNearEnd?.()
      }

      // Crossfade: fire exactly crossfadeTime before end
      if (this.crossfadeTime > 0 && !this._crossfadeStarted
          && this.duration > 0 && time >= this.duration - this.crossfadeTime) {
        this._crossfadeStarted = true
        this.onCrossfadeStart?.()
      }
    }, 100)
  }

  _stopTimeUpdate() {
    if (this._timeUpdateInterval) {
      clearInterval(this._timeUpdateInterval)
      this._timeUpdateInterval = null
    }
  }

  _stopCurrentSource(resetPreload = false) {
    if (this.currentSource) {
      try { this.currentSource.onended = null; this.currentSource.stop(); this.currentSource.disconnect() } catch (_) {}
      this.currentSource = null
    }
    if (resetPreload) {
      this._preloadTriggered = false
      this._crossfadeStarted = false
    }
  }

  destroy() {
    this.stop()
    this._stopTimeUpdate()
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null }
  }

  get fftSize()           { return this.analyserNode?.fftSize || 2048 }
  get frequencyBinCount() { return this.analyserNode?.frequencyBinCount || 1024 }
}

let _instance = null
export function getAudioEngine() {
  if (!_instance) _instance = new AudioEngine()
  return _instance
}
