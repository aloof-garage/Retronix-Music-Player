// ── Retronix Audio Engine ──────────────────────────────────────────────────────
// Web Audio API playback engine.
// Files are loaded via IPC base64 read — no CSP or protocol restrictions.
// Signal chain: BufferSource → EQ[10] → GainNode → MasterGain → Analyser → out

const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export class AudioEngine {
  constructor() {
    this.audioContext    = null
    this.currentSource  = null
    this.gainNode       = null        // crossfade gain
    this.masterGainNode = null        // master volume
    this.analyserNode   = null
    this.eqNodes        = []

    this.currentBuffer  = null
    this.startTime      = 0
    this.pauseOffset    = 0
    this.isPlaying      = false
    this.duration       = 0

    // Stored values applied even before the audio context is created
    this.volume    = 0.75
    this.eqEnabled = true
    this.eqGains   = Object.fromEntries(EQ_BANDS.map(f => [f, 0]))

    this.onEnded        = null
    this.onTimeUpdate   = null
    this.onError        = null
    this.onBufferLoaded = null

    this._timeUpdateInterval = null
  }

  // ── Initialization ──────────────────────────────────────────────────────────
  async init() {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }
      return
    }

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'playback',
    })

    this._buildSignalChain()
    console.log('[AudioEngine] Initialized, sampleRate:', this.audioContext.sampleRate)
  }

  _buildSignalChain() {
    const ctx = this.audioContext

    // 10-band EQ — initialise each node with the already-stored gain value
    // so any EQ changes made before first play are respected immediately.
    this.eqNodes = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.41
      // Apply stored gain (0 by default, or whatever was set before play)
      f.gain.value = this.eqEnabled ? (this.eqGains[freq] || 0) : 0
      return f
    })

    // Chain EQ nodes in series
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1])
    }

    // Crossfade gain node
    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 1.0

    // Master volume
    this.masterGainNode = ctx.createGain()
    this.masterGainNode.gain.value = this.volume   // apply stored volume

    // Analyser
    this.analyserNode = ctx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    this.analyserNode.minDecibels = -90
    this.analyserNode.maxDecibels = -10

    // Final chain: EQ[last] → gain → masterGain → analyser → destination
    this.eqNodes[this.eqNodes.length - 1].connect(this.gainNode)
    this.gainNode.connect(this.masterGainNode)
    this.masterGainNode.connect(this.analyserNode)
    this.analyserNode.connect(ctx.destination)
  }

  // ── File Loading ───────────────────────────────────────────────────────────
  async loadFile(filePath) {
    await this.init()

    try {
      const arrayBuffer = await this._readFileAsArrayBuffer(filePath)
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      this.currentBuffer = audioBuffer
      this.duration = audioBuffer.duration
      this.onBufferLoaded?.(audioBuffer.duration)
      console.log('[AudioEngine] Loaded:', filePath, `(${audioBuffer.duration.toFixed(1)}s)`)
      return audioBuffer
    } catch (err) {
      console.error('[AudioEngine] Load failed:', filePath, err)
      this.onError?.(`Cannot load audio: ${err.message}`)
      throw err
    }
  }

  async _readFileAsArrayBuffer(filePath) {
    // ── Strategy 1: IPC base64 (primary) ─────────────────────────────────────
    // Main process reads the file bytes; renderer decodes. No CSP / CORS / protocol issues.
    if (window.electronAPI?.audio?.readFileBase64) {
      const base64 = await window.electronAPI.audio.readFileBase64(filePath)
      if (base64) return this._base64ToArrayBuffer(base64)
      throw new Error(`File not readable via IPC: ${filePath}`)
    }

    // ── Strategy 2: retronix:// protocol fetch (fallback) ─────────────────────
    if (window.electronAPI) {
      const url      = 'retronix:///' + encodeURIComponent(filePath)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      return response.arrayBuffer()
    }

    // ── Strategy 3: plain fetch (web/dev mode) ────────────────────────────────
    const response = await fetch(filePath)
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${filePath}`)
    return response.arrayBuffer()
  }

  _base64ToArrayBuffer(base64) {
    const binary = atob(base64)
    const buf    = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
    return buf.buffer
  }

  // ── Playback ───────────────────────────────────────────────────────────────
  play(offset = 0) {
    if (!this.currentBuffer) {
      console.warn('[AudioEngine] play() — no buffer loaded')
      return
    }
    if (this.audioContext.state === 'suspended') this.audioContext.resume()

    this._stopCurrentSource()

    const source = this.audioContext.createBufferSource()
    source.buffer = this.currentBuffer
    source.connect(this.eqNodes[0])

    source.onended = () => {
      if (this.isPlaying) {
        this.isPlaying   = false
        this.pauseOffset = 0
        this._stopTimeUpdate()
        this.onEnded?.()
      }
    }

    const safe = Math.max(0, Math.min(offset, this.duration - 0.001))
    this.pauseOffset  = safe
    this.startTime    = this.audioContext.currentTime - safe
    source.start(0, safe)
    this.currentSource = source
    this.isPlaying     = true

    this._startTimeUpdate()
  }

  pause() {
    if (!this.isPlaying) return
    this.pauseOffset = this.getCurrentTime()
    this._stopCurrentSource()
    this.isPlaying = false
    this._stopTimeUpdate()
  }

  stop() {
    this._stopCurrentSource()
    this.isPlaying   = false
    this.pauseOffset = 0
    this._stopTimeUpdate()
  }

  seek(time) {
    const t = Math.max(0, Math.min(time, this.duration))
    const wasPlaying = this.isPlaying

    this._stopCurrentSource()
    this.isPlaying   = false
    this._stopTimeUpdate()
    this.pauseOffset = t

    if (wasPlaying) {
      this.play(t)
    } else {
      this.onTimeUpdate?.(t, this.duration)
    }
  }

  // ── Volume & EQ ───────────────────────────────────────────────────────────
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(volume, 100)) / 100
    if (this.masterGainNode && this.audioContext) {
      this.masterGainNode.gain.setTargetAtTime(
        this.volume,
        this.audioContext.currentTime,
        0.015
      )
    }
    // If audio context not yet created, the value is stored in this.volume
    // and will be applied in _buildSignalChain when a track is first played.
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
    // If nodes don't exist yet the value is stored in eqGains and
    // will be applied by _buildSignalChain on first play.
  }

  setEqEnabled(enabled) {
    this.eqEnabled = enabled
    if (!this.audioContext || !this.eqNodes.length) return
    EQ_BANDS.forEach((freq, i) => {
      const node = this.eqNodes[i]
      if (!node) return
      const gain = enabled ? (this.eqGains[freq] || 0) : 0
      node.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.015)
    })
  }

  applyEqPreset(preset) {
    const presets = {
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
    const gains = presets[preset] || presets.flat
    EQ_BANDS.forEach((freq, i) => this.setEqBand(freq, gains[i]))
    return Object.fromEntries(EQ_BANDS.map((f, i) => [f, gains[i]]))
  }

  // ── Analyser data ─────────────────────────────────────────────────────────
  getFrequencyData() {
    if (!this.analyserNode) return new Uint8Array(1024)
    const d = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteFrequencyData(d)
    return d
  }

  getTimeDomainData() {
    if (!this.analyserNode) return new Uint8Array(2048)
    const d = new Uint8Array(this.analyserNode.fftSize)
    this.analyserNode.getByteTimeDomainData(d)
    return d
  }

  // ── Time tracking ─────────────────────────────────────────────────────────
  getCurrentTime() {
    if (!this.isPlaying || !this.audioContext) return this.pauseOffset
    return Math.min(this.audioContext.currentTime - this.startTime, this.duration || 0)
  }

  _startTimeUpdate() {
    this._stopTimeUpdate()
    this._timeUpdateInterval = setInterval(() => {
      if (this.isPlaying) this.onTimeUpdate?.(this.getCurrentTime(), this.duration)
    }, 200)
  }

  _stopTimeUpdate() {
    if (this._timeUpdateInterval) {
      clearInterval(this._timeUpdateInterval)
      this._timeUpdateInterval = null
    }
  }

  _stopCurrentSource() {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null
        this.currentSource.stop()
        this.currentSource.disconnect()
      } catch (_) { /* already stopped */ }
      this.currentSource = null
    }
  }

  destroy() {
    this.stop()
    this._stopTimeUpdate()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  get fftSize()           { return this.analyserNode?.fftSize          || 2048 }
  get frequencyBinCount() { return this.analyserNode?.frequencyBinCount || 1024 }
}

// Singleton — one engine per renderer process
let _instance = null
export function getAudioEngine() {
  if (!_instance) _instance = new AudioEngine()
  return _instance
}
