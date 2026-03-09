// ── Retronix Audio Engine ──────────────────────────────────────────────────────
// Web Audio API based engine. Files are loaded via IPC (base64) so there are
// zero CSP / protocol restrictions — it works regardless of Electron security
// settings. The signal chain is: source → EQ filters → gainNode → masterGain →
// analyser → destination.

const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export class AudioEngine {
  constructor() {
    this.audioContext    = null
    this.currentSource  = null
    this.gainNode       = null
    this.masterGainNode = null
    this.analyserNode   = null
    this.eqNodes        = []
    this.currentBuffer  = null

    this.startTime  = 0
    this.pauseOffset = 0
    this.isPlaying  = false
    this.duration   = 0

    this.volume  = 0.75
    this.eqGains = Object.fromEntries(EQ_BANDS.map(f => [f, 0]))
    this.eqEnabled = true

    this.onEnded       = null
    this.onTimeUpdate  = null
    this.onError       = null
    this.onBufferLoaded = null

    this._timeUpdateInterval = null
    this._loadedFilePath     = null
  }

  // ── Initialization ─────────────────────────────────────────────────────────
  async init() {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume()
      return
    }

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'playback',
    })

    this._buildSignalChain()
    console.log('[AudioEngine] Init — sampleRate:', this.audioContext.sampleRate)
  }

  _buildSignalChain() {
    const ctx = this.audioContext

    // 10-band EQ
    this.eqNodes = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = freq
      f.gain.value = 0
      f.Q.value = 1.41
      return f
    })
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1])
    }

    // Analyser
    this.analyserNode = ctx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    this.analyserNode.minDecibels = -90
    this.analyserNode.maxDecibels = -10

    // Crossfade gain
    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 1.0

    // Master volume
    this.masterGainNode = ctx.createGain()
    this.masterGainNode.gain.value = this.volume

    // Chain: EQ → gainNode → masterGain → analyser → out
    this.eqNodes[this.eqNodes.length - 1].connect(this.gainNode)
    this.gainNode.connect(this.masterGainNode)
    this.masterGainNode.connect(this.analyserNode)
    this.analyserNode.connect(ctx.destination)
  }

  // ── File loading ───────────────────────────────────────────────────────────
  // Primary strategy: IPC base64 read — works regardless of CSP/protocol config.
  // Fallback: retronix:// protocol fetch (requires registerSchemesAsPrivileged).
  async loadFile(filePath) {
    await this.init()
    this._loadedFilePath = filePath

    let arrayBuffer
    try {
      arrayBuffer = await this._readFileAsArrayBuffer(filePath)
    } catch (err) {
      console.error('[AudioEngine] Load failed:', filePath, err)
      this.onError?.(`Cannot load: ${err.message}`)
      throw err
    }

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      this.currentBuffer = audioBuffer
      this.duration = audioBuffer.duration
      this.onBufferLoaded?.(audioBuffer.duration)
      console.log('[AudioEngine] Loaded:', filePath, `(${audioBuffer.duration.toFixed(1)}s)`)
      return audioBuffer
    } catch (err) {
      console.error('[AudioEngine] Decode failed:', err)
      this.onError?.(`Cannot decode audio: ${err.message}`)
      throw err
    }
  }

  async _readFileAsArrayBuffer(filePath) {
    // Strategy 1: IPC base64 (most reliable — no CSP, no CORS, no protocol issues)
    if (window.electronAPI?.audio?.readFileBase64) {
      const base64 = await window.electronAPI.audio.readFileBase64(filePath)
      if (!base64) throw new Error(`File not readable: ${filePath}`)
      return this._base64ToArrayBuffer(base64)
    }

    // Strategy 2: retronix:// protocol (requires protocol.handle + registerSchemesAsPrivileged)
    if (window.electronAPI) {
      const url = 'retronix:///' + encodeURIComponent(filePath)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`fetch ${url} → ${response.status}`)
      return response.arrayBuffer()
    }

    // Strategy 3: plain fetch for dev/web mode
    const response = await fetch(filePath)
    if (!response.ok) throw new Error(`fetch ${filePath} → ${response.status}`)
    return response.arrayBuffer()
  }

  _base64ToArrayBuffer(base64) {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  // ── Playback ───────────────────────────────────────────────────────────────
  play(offset = 0) {
    if (!this.currentBuffer) {
      console.warn('[AudioEngine] play() called with no buffer loaded')
      return
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }

    this._stopCurrentSource()

    const source = this.audioContext.createBufferSource()
    source.buffer = this.currentBuffer
    source.connect(this.eqNodes[0])

    source.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false
        this.pauseOffset = 0
        this._stopTimeUpdate()
        this.onEnded?.()
      }
    }

    const safeOffset = Math.max(0, Math.min(offset, this.duration - 0.01))
    this.pauseOffset = safeOffset
    this.startTime   = this.audioContext.currentTime - safeOffset
    source.start(0, safeOffset)
    this.currentSource = source
    this.isPlaying = true

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
    const clampedTime = Math.max(0, Math.min(time, this.duration))
    const wasPlaying = this.isPlaying
    if (wasPlaying) {
      this._stopCurrentSource()
      this.isPlaying = false
      this._stopTimeUpdate()
    }
    this.pauseOffset = clampedTime
    if (wasPlaying) {
      this.play(clampedTime)
    } else {
      // Update time display even when paused
      this.onTimeUpdate?.(clampedTime, this.duration)
    }
  }

  // ── Volume & EQ ───────────────────────────────────────────────────────────
  setVolume(volume) {
    // volume is 0–100
    this.volume = Math.max(0, Math.min(volume, 100)) / 100
    if (this.masterGainNode && this.audioContext) {
      this.masterGainNode.gain.setTargetAtTime(
        this.volume,
        this.audioContext.currentTime,
        0.015
      )
    }
  }

  setEqBand(frequency, gainDb) {
    this.eqGains[frequency] = gainDb
    if (!this.eqEnabled) return
    const idx = EQ_BANDS.indexOf(Number(frequency))
    const node = this.eqNodes[idx]
    if (node && this.audioContext) {
      node.gain.setTargetAtTime(gainDb, this.audioContext.currentTime, 0.01)
    }
  }

  setEqEnabled(enabled) {
    this.eqEnabled = enabled
    if (!this.audioContext) return
    EQ_BANDS.forEach((freq, i) => {
      const node = this.eqNodes[i]
      if (node) {
        const gain = enabled ? (this.eqGains[freq] || 0) : 0
        node.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01)
      }
    })
  }

  applyEqPreset(preset) {
    const presets = {
      flat:         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass_boost:   [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
      treble_boost: [0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
      rock:         [5, 4, 3, 1, 0, -1, 1, 3, 4, 5],
      pop:          [-1, 0, 2, 4, 3, 0, -1, -1, 0, 0],
      jazz:         [4, 3, 1, 2, -2, -2, 0, 1, 3, 4],
      classical:    [5, 4, 3, 2, -1, -1, 0, 2, 3, 4],
      electronic:   [4, 4, 2, 0, -2, 2, 1, 2, 4, 4],
      vocal:        [-2, -2, 0, 3, 5, 5, 3, 2, -1, -2],
      loudness:     [6, 4, 0, 0, -2, 0, 0, 0, 4, 6],
    }
    const gains = presets[preset] || presets.flat
    EQ_BANDS.forEach((freq, i) => this.setEqBand(freq, gains[i]))
    return Object.fromEntries(EQ_BANDS.map((f, i) => [f, gains[i]]))
  }

  // ── Analyser ──────────────────────────────────────────────────────────────
  getFrequencyData() {
    if (!this.analyserNode) return null
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteFrequencyData(data)
    return data
  }

  getTimeDomainData() {
    if (!this.analyserNode) return null
    const data = new Uint8Array(this.analyserNode.fftSize)
    this.analyserNode.getByteTimeDomainData(data)
    return data
  }

  // ── Time tracking ─────────────────────────────────────────────────────────
  getCurrentTime() {
    if (!this.isPlaying || !this.audioContext) return this.pauseOffset
    return Math.min(
      this.audioContext.currentTime - this.startTime,
      this.duration || 0
    )
  }

  _startTimeUpdate() {
    this._stopTimeUpdate()
    this._timeUpdateInterval = setInterval(() => {
      if (this.isPlaying && this.onTimeUpdate) {
        this.onTimeUpdate(this.getCurrentTime(), this.duration)
      }
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
      } catch (e) { /* already stopped */ }
      this.currentSource = null
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  destroy() {
    this.stop()
    this._stopTimeUpdate()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  get fftSize()          { return this.analyserNode?.fftSize          || 2048 }
  get frequencyBinCount(){ return this.analyserNode?.frequencyBinCount || 1024 }
}

// Singleton
let _instance = null
export function getAudioEngine() {
  if (!_instance) _instance = new AudioEngine()
  return _instance
}
