// ── Retronix Visualizer Engine ─────────────────────────────────────────────────
// All visualizers call this.getAnalyser() fresh each frame so they work even when
// the AudioContext is created after the panel mounts.

export class Visualizer {
  constructor(canvas, getAnalyser, theme) {
    this.canvas     = canvas
    this.ctx        = canvas.getContext('2d')
    // Accept either a function (getter) or a static node
    this.getAnalyser = typeof getAnalyser === 'function' ? getAnalyser : () => getAnalyser
    this.theme      = theme || {}
    this.animId     = null
    this.type       = 'spectrum'
    this.isActive   = false
    this.peaks      = []
    this.peakDecay  = []
    this._barCount  = 64
    this._idle      = new Float32Array(this._barCount).fill(0)
  }

  setType(type) {
    this.type = type
    // Reset peak state so new type starts clean
    this.peaks = []
    this.peakDecay = []
  }
  setTheme(theme) { this.theme = theme }

  // Allow hot-swapping the analyser getter
  setAnalyserGetter(fn) {
    this.getAnalyser = typeof fn === 'function' ? fn : () => fn
  }

  start() {
    this.isActive = true
    this._loop()
  }

  stop() {
    this.isActive = false
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null }
  }

  _loop() {
    if (!this.isActive) return
    this.animId = requestAnimationFrame(() => this._loop())
    this._draw()
  }

  _draw() {
    const { canvas, ctx } = this
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    switch (this.type) {
      case 'spectrum':     return this._drawSpectrum(W, H)
      case 'waveform':     return this._drawWaveform(W, H)
      case 'led_bars':     return this._drawLedBars(W, H)
      case 'circular':     return this._drawCircular(W, H)
      case 'oscilloscope': return this._drawOscilloscope(W, H)
      default:             return this._drawSpectrum(W, H)
    }
  }

  _getFreqData() {
    const analyser = this.getAnalyser()
    if (!analyser) return new Uint8Array(128)
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    return data
  }

  _getTimeData() {
    const analyser = this.getAnalyser()
    if (!analyser) { const d = new Uint8Array(2048); d.fill(128); return d }
    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)
    return data
  }

  // ── Idle animation (ambient bars when no audio) ───────────────────────────
  _idleFreqData(size) {
    const t = Date.now() * 0.0008
    const d = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      d[i] = Math.max(0, Math.sin(i * 0.15 + t) * 30 + Math.sin(i * 0.07 - t * 1.3) * 20 + 18)
    }
    return d
  }

  _safeFreqData() {
    const analyser = this.getAnalyser()
    if (analyser) {
      const d = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(d)
      // If all zeros (paused/no audio), return idle
      const sum = d.reduce((a, v) => a + v, 0)
      if (sum > 0) return d
    }
    return this._idleFreqData(128)
  }

  // ── Spectrum Analyzer ─────────────────────────────────────────────────────
  _drawSpectrum(W, H) {
    const { ctx } = this
    const data = this._safeFreqData()
    const bars = this._barCount
    const barW = W / bars
    const T = this.theme

    if (this.peaks.length !== bars) {
      this.peaks = Array(bars).fill(0)
      this.peakDecay = Array(bars).fill(0)
    }

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * data.length * 0.7)
      const value = data[idx] / 255
      const barH = Math.max(2, value * H * 0.95)
      const x = i * barW + 0.5

      const grad = ctx.createLinearGradient(0, H - barH, 0, H)
      grad.addColorStop(0, T.spectrumTop || '#e8834a')
      grad.addColorStop(0.6, T.accent || '#e8834a')
      grad.addColorStop(1, T.spectrumBottom || '#7a2a08')
      ctx.fillStyle = grad
      ctx.fillRect(x, H - barH, barW - 1.5, barH)

      if (this.peaks[i] > barH) {
        ctx.fillStyle = T.spectrumTop || '#e8834a'
        ctx.globalAlpha = 0.8
        ctx.fillRect(x, H - this.peaks[i] - 2, barW - 1.5, 2)
        ctx.globalAlpha = 1
      }

      if (barH > this.peaks[i]) {
        this.peaks[i] = barH
        this.peakDecay[i] = 0
      } else {
        this.peakDecay[i] = (this.peakDecay[i] || 0) + 0.3
        this.peaks[i] = Math.max(0, this.peaks[i] - this.peakDecay[i])
      }
    }
  }

  // ── Waveform ──────────────────────────────────────────────────────────────
  _drawWaveform(W, H) {
    const { ctx } = this
    const data = this._getTimeData()
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    // Center line
    ctx.strokeStyle = `${T.accent || '#e8834a'}22`
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()

    ctx.shadowColor = T.accent || '#e8834a'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.strokeStyle = T.accent || '#e8834a'
    ctx.lineWidth = 2
    const sliceW = W / data.length

    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128
      const y = (v * H) / 2
      if (i === 0) ctx.moveTo(0, y)
      else ctx.lineTo(i * sliceW, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  // ── LED Bars ──────────────────────────────────────────────────────────────
  _drawLedBars(W, H) {
    const { ctx } = this
    const data = this._safeFreqData()
    const bars = Math.min(32, Math.floor(W / 10))
    const barW = Math.floor(W / bars)
    const ledH = Math.floor(H / 22)
    const gap = 2
    const ledCount = Math.floor(H / (ledH + gap))
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * data.length * 0.7)
      const value = data[idx] / 255
      const activeLeds = Math.ceil(value * ledCount)

      for (let j = 0; j < ledCount; j++) {
        const isActive = j >= ledCount - activeLeds
        const isRed    = j >= ledCount * 0.9
        const isYellow = j >= ledCount * 0.72
        const y = H - (j + 1) * (ledH + gap)
        const x = i * barW + 1

        if (isActive) {
          const color = isRed ? (T.ledRed || '#ff4444') : isYellow ? (T.ledYellow || '#ffaa00') : (T.ledGreen || '#4cff88')
          ctx.fillStyle = color
          ctx.shadowColor = color
          ctx.shadowBlur = 4
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.04)'
          ctx.shadowBlur = 0
        }
        ctx.fillRect(x, y, barW - 2, ledH)
      }
    }
    ctx.shadowBlur = 0
  }

  // ── Circular Spectrum ─────────────────────────────────────────────────────
  _drawCircular(W, H) {
    const { ctx } = this
    const data = this._safeFreqData()
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    const cx = W / 2, cy = H / 2
    const radius = Math.min(W, H) * 0.28
    const bars = 120

    ctx.save()
    ctx.translate(cx, cy)

    // Inner ring glow
    const radGrad = ctx.createRadialGradient(0, 0, radius * 0.7, 0, 0, radius * 1.5)
    radGrad.addColorStop(0, `${T.accent || '#e8834a'}11`)
    radGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = radGrad
    ctx.beginPath(); ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2); ctx.fill()

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * data.length * 0.65)
      const value = data[idx] / 255
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2
      const len = value * radius * 0.9
      const r0 = radius - 2
      const r1 = radius + len

      const grd = ctx.createLinearGradient(
        Math.cos(angle) * r0, Math.sin(angle) * r0,
        Math.cos(angle) * r1, Math.sin(angle) * r1
      )
      grd.addColorStop(0, T.accent || '#e8834a')
      grd.addColorStop(1, `${T.accent || '#e8834a'}44`)

      ctx.beginPath()
      ctx.strokeStyle = grd
      ctx.globalAlpha = 0.6 + value * 0.4
      ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * radius / bars) * 0.7)
      ctx.moveTo(Math.cos(angle) * r0, Math.sin(angle) * r0)
      ctx.lineTo(Math.cos(angle) * r1, Math.sin(angle) * r1)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(0, 0, radius - 4, 0, Math.PI * 2)
    ctx.strokeStyle = `${T.accent || '#e8834a'}44`
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.restore()
  }

  // ── Oscilloscope ──────────────────────────────────────────────────────────
  _drawOscilloscope(W, H) {
    const { ctx } = this
    const data = this._getTimeData()
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = `${T.accent || '#e8834a'}18`
    ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
    for (let i = 1; i < 8; i++) {
      const x = (W / 8) * i
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }

    // Glow fill under the waveform
    ctx.save()
    ctx.beginPath()
    const firstV = (data[0] / 128) - 1
    ctx.moveTo(0, H / 2 + firstV * H * 0.45)
    for (let i = 1; i < data.length; i++) {
      const v = (data[i] / 128) - 1
      ctx.lineTo((i / data.length) * W, H / 2 + v * H * 0.45)
    }
    ctx.lineTo(W, H / 2); ctx.lineTo(0, H / 2)
    ctx.closePath()
    ctx.fillStyle = `${T.accent || '#e8834a'}18`
    ctx.fill()
    ctx.restore()

    ctx.shadowColor = T.accent || '#e8834a'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.strokeStyle = T.accent || '#e8834a'
    ctx.lineWidth = 1.5
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] / 128) - 1
      const y = H / 2 + v * H * 0.45
      const x = (i / data.length) * W
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

// ── Mini spectrum for bottom bar ──────────────────────────────────────────────
export function drawMiniSpectrum(canvas, analyser, isPlaying, theme, barsRef) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height, T = theme

  if (analyser && isPlaying) {
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    barsRef.current = barsRef.current.map((_, i) => {
      const idx = Math.floor((i / barsRef.current.length) * data.length * 0.7)
      return data[idx] / 255
    })
  } else {
    barsRef.current = barsRef.current.map(v => v * 0.92)
  }

  ctx.clearRect(0, 0, W, H)
  const barW = W / barsRef.current.length
  barsRef.current.forEach((v, i) => {
    const h = Math.max(2, v * H)
    const x = i * barW + 0.5
    const grad = ctx.createLinearGradient(0, H - h, 0, H)
    grad.addColorStop(0, T.spectrumTop || '#e8834a')
    grad.addColorStop(1, T.spectrumBottom || '#7a2a08')
    ctx.fillStyle = grad
    ctx.fillRect(x, H - h, barW - 1.5, h)
  })
}
