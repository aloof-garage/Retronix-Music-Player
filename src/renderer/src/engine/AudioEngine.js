// ── Retronix Audio Engine ──────────────────────────────────────────────────────
// Web Audio API based playback engine with 10-band EQ, analyser, and crossfade

const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export class AudioEngine {
  constructor() {
    this.audioContext = null
    this.currentSource = null
    this.nextSource = null
    this.gainNode = null
    this.masterGainNode = null
    this.analyserNode = null
    this.eqNodes = []
    this.currentBuffer = null
    this.nextBuffer = null

    this.startTime = 0
    this.pauseOffset = 0
    this.isPlaying = false
    this.duration = 0
    this.crossfadeDuration = 2 // seconds
    this.gapless = true

    this.volume = 0.75
    this.eqGains = Object.fromEntries(EQ_BANDS.map(f => [f, 0]))

    this.onEnded = null
    this.onTimeUpdate = null
    this.onError = null
    this.onBufferLoaded = null

    this._timeUpdateInterval = null
    this._loadedFilePath = null
  }

  // ── Initialization ─────────────────────────────────────────────────────────
  async init() {
    if (this.audioContext) return

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'playback',
      sampleRate: 44100
    })

    this._buildSignalChain()
    console.log('[AudioEngine] Initialized, sampleRate:', this.audioContext.sampleRate)
  }

  _buildSignalChain() {
    const ctx = this.audioContext

    // Master gain (volume)
    this.masterGainNode = ctx.createGain()
    this.masterGainNode.gain.value = this.volume

    // 10-band EQ using BiquadFilterNodes
    this.eqNodes = EQ_BANDS.map((freq, i) => {
      const filter = ctx.createBiquadFilter()
      if (i === 0) {
        filter.type = 'lowshelf'
      } else if (i === EQ_BANDS.length - 1) {
        filter.type = 'highshelf'
      } else {
        filter.type = 'peaking'
      }
      filter.frequency.value = freq
      filter.gain.value = this.eqGains[freq] || 0
      filter.Q.value = 1.41
      return filter
    })

    // Chain EQ nodes together
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1])
    }

    // Analyser node for visualizations
    this.analyserNode = ctx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    this.analyserNode.minDecibels = -90
    this.analyserNode.maxDecibels = -10

    // Main gain (for crossfade)
    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 1.0

    // Signal chain: source → EQ[0] → ... → EQ[9] → gainNode → masterGain → analyser → output
    this.eqNodes[this.eqNodes.length - 1].connect(this.gainNode)
    this.gainNode.connect(this.masterGainNode)
    this.masterGainNode.connect(this.analyserNode)
    this.analyserNode.connect(ctx.destination)
  }

  // ── File Loading ───────────────────────────────────────────────────────────
  async loadFile(filePath) {
    await this.init()

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    this._loadedFilePath = filePath

    try {
      let arrayBuffer

      // Try Electron file protocol first
      if (window.electronAPI) {
        const response = await fetch(`retronix:///${encodeURIComponent(filePath)}`)
        arrayBuffer = await response.arrayBuffer()
      } else {
        // Web fallback
        const response = await fetch(filePath)
        arrayBuffer = await response.arrayBuffer()
      }

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      this.currentBuffer = audioBuffer
      this.duration = audioBuffer.duration

      this.onBufferLoaded?.(audioBuffer.duration)
      return audioBuffer

    } catch (err) {
      console.error('[AudioEngine] Failed to load:', filePath, err)
      this.onError?.(err.message)
      throw err
    }
  }

  // ── Playback ───────────────────────────────────────────────────────────────
  play(offset = 0) {
    if (!this.currentBuffer) return
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
        this._stopTimeUpdate()
        this.onEnded?.()
      }
    }

    this.pauseOffset = offset
    this.startTime = this.audioContext.currentTime - offset
    source.start(0, offset)
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
    this.isPlaying = false
    this.pauseOffset = 0
    this._stopTimeUpdate()
  }

  seek(time) {
    const wasPlaying = this.isPlaying
    this.stop()
    this.pauseOffset = time
    if (wasPlaying) {
      this.play(time)
    }
  }

  // ── Gapless / Crossfade ────────────────────────────────────────────────────
  async preloadNext(filePath) {
    if (!filePath) return
    try {
      let arrayBuffer
      if (window.electronAPI) {
        const response = await fetch(`retronix:///${encodeURIComponent(filePath)}`)
        arrayBuffer = await response.arrayBuffer()
      } else {
        const response = await fetch(filePath)
        arrayBuffer = await response.arrayBuffer()
      }
      this.nextBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
    } catch (err) {
      console.warn('[AudioEngine] Failed to preload next:', err.message)
    }
  }

  crossfadeTo(newBuffer, duration = 2) {
    if (!newBuffer) return

    const ctx = this.audioContext
    const now = ctx.currentTime

    // Fade out current
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(1, now)
      this.gainNode.gain.linearRampToValueAtTime(0, now + duration)
    }

    // Create new source with fade-in gain
    const newGain = ctx.createGain()
    newGain.gain.setValueAtTime(0, now)
    newGain.gain.linearRampToValueAtTime(1, now + duration)

    const newSource = ctx.createBufferSource()
    newSource.buffer = newBuffer
    newSource.connect(this.eqNodes[0])
    newSource.start(0)

    setTimeout(() => {
      this._stopCurrentSource()
      this.currentBuffer = newBuffer
      this.duration = newBuffer.duration
      this.currentSource = newSource
      this.startTime = ctx.currentTime
      this.gainNode.gain.setValueAtTime(1, ctx.currentTime)
    }, duration * 1000)
  }

  // ── Volume & EQ ───────────────────────────────────────────────────────────
  setVolume(volume) {
    this.volume = volume / 100
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(
        this.volume,
        this.audioContext?.currentTime || 0,
        0.01
      )
    }
  }

  setEqBand(frequency, gainDb) {
    this.eqGains[frequency] = gainDb
    const node = this.eqNodes[EQ_BANDS.indexOf(frequency)]
    if (node) {
      node.gain.setTargetAtTime(gainDb, this.audioContext.currentTime, 0.01)
    }
  }

  setEqEnabled(enabled) {
    if (!this.gainNode) return
    // Bypass EQ by connecting directly to gain, or route through EQ
    // For simplicity, zero all gains when disabled
    if (!enabled) {
      this.eqNodes.forEach(node => {
        node.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.01)
      })
    } else {
      EQ_BANDS.forEach((freq, i) => {
        this.eqNodes[i].gain.setTargetAtTime(
          this.eqGains[freq] || 0,
          this.audioContext.currentTime,
          0.01
        )
      })
    }
  }

  applyEqPreset(preset) {
    const presets = {
      flat:        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass_boost:  [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
      treble_boost:[0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
      rock:        [5, 4, 3, 1, 0, -1, 1, 3, 4, 5],
      pop:         [-1, 0, 2, 4, 3, 0, -1, -1, 0, 0],
      jazz:        [4, 3, 1, 2, -2, -2, 0, 1, 3, 4],
      classical:   [5, 4, 3, 2, -1, -1, 0, 2, 3, 4],
      electronic:  [4, 4, 2, 0, -2, 2, 1, 2, 4, 4],
      vocal:       [-2, -2, 0, 3, 5, 5, 3, 2, -1, -2],
      loudness:    [6, 4, 0, 0, -2, 0, 0, 0, 4, 6],
    }

    const gains = presets[preset] || presets.flat
    EQ_BANDS.forEach((freq, i) => {
      this.setEqBand(freq, gains[i])
    })
    return Object.fromEntries(EQ_BANDS.map((f, i) => [f, gains[i]]))
  }

  // ── Analyser Data ─────────────────────────────────────────────────────────
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

  getFloatFrequencyData() {
    if (!this.analyserNode) return null
    const data = new Float32Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getFloatFrequencyData(data)
    return data
  }

  // ── Time tracking ─────────────────────────────────────────────────────────
  getCurrentTime() {
    if (!this.isPlaying || !this.audioContext) return this.pauseOffset
    return Math.min(
      this.audioContext.currentTime - this.startTime,
      this.duration || Infinity
    )
  }

  _startTimeUpdate() {
    this._stopTimeUpdate()
    this._timeUpdateInterval = setInterval(() => {
      if (this.isPlaying && this.onTimeUpdate) {
        this.onTimeUpdate(this.getCurrentTime(), this.duration)
      }
    }, 250)
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

  // ── Getters ───────────────────────────────────────────────────────────────
  get fftSize() { return this.analyserNode?.fftSize || 2048 }
  get frequencyBinCount() { return this.analyserNode?.frequencyBinCount || 1024 }
}

// Singleton instance
let engineInstance = null
export function getAudioEngine() {
  if (!engineInstance) engineInstance = new AudioEngine()
  return engineInstance
}
