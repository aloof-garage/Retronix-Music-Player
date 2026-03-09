// ── Retronix Visualizer Engine ─────────────────────────────────────────────────
// Multiple visualizer types: spectrum, waveform, LED bars, circular

export class Visualizer {
  constructor(canvas, analyserNode, theme) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.analyser = analyserNode
    this.theme = theme
    this.animId = null
    this.type = 'spectrum'
    this.isActive = false
    this.peaks = []
    this.peakDecay = []
    this._barCount = 64
  }

  setType(type) { this.type = type }
  setTheme(theme) { this.theme = theme }

  start() {
    this.isActive = true
    this._loop()
  }

  stop() {
    this.isActive = false
    if (this.animId) {
      cancelAnimationFrame(this.animId)
      this.animId = null
    }
  }

  _loop() {
    if (!this.isActive) return
    this.animId = requestAnimationFrame(() => this._loop())
    this._draw()
  }

  _draw() {
    const { canvas, ctx } = this
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    switch (this.type) {
      case 'spectrum':      return this._drawSpectrum(W, H)
      case 'waveform':      return this._drawWaveform(W, H)
      case 'led_bars':      return this._drawLedBars(W, H)
      case 'circular':      return this._drawCircular(W, H)
      case 'oscilloscope':  return this._drawOscilloscope(W, H)
      default:              return this._drawSpectrum(W, H)
    }
  }

  _getFreqData() {
    if (!this.analyser) return new Uint8Array(128)
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  _getTimeData() {
    if (!this.analyser) return new Uint8Array(2048)
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    return data
  }

  // ── Spectrum Analyzer ────────────────────────────────────────────────────
  _drawSpectrum(W, H) {
    const { ctx } = this
    const data = this._getFreqData()
    const bars = this._barCount
    const barW = W / bars
    const T = this.theme

    // Initialize peaks
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

      // Bar gradient
      const grad = ctx.createLinearGradient(0, H - barH, 0, H)
      grad.addColorStop(0, T.spectrumTop || '#e8834a')
      grad.addColorStop(0.6, T.accent || '#e8834a')
      grad.addColorStop(1, T.spectrumBottom || '#7a2a08')
      ctx.fillStyle = grad
      ctx.fillRect(x, H - barH, barW - 1.5, barH)

      // Peak dot
      const peak = this.peaks[i]
      if (peak > barH) {
        ctx.fillStyle = T.spectrumTop || '#e8834a'
        ctx.globalAlpha = 0.8
        ctx.fillRect(x, H - peak - 2, barW - 1.5, 2)
        ctx.globalAlpha = 1
      }

      // Update peaks
      if (barH > this.peaks[i]) {
        this.peaks[i] = barH
        this.peakDecay[i] = 0
      } else {
        this.peakDecay[i] = (this.peakDecay[i] || 0) + 0.3
        this.peaks[i] = Math.max(0, this.peaks[i] - this.peakDecay[i])
      }
    }
  }

  // ── Waveform Display ─────────────────────────────────────────────────────
  _drawWaveform(W, H) {
    const { ctx } = this
    const data = this._getTimeData()
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    // Glow effect
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

  // ── Retro LED Bars ────────────────────────────────────────────────────────
  _drawLedBars(W, H) {
    const { ctx } = this
    const data = this._getFreqData()
    const bars = Math.min(32, Math.floor(W / 10))
    const barW = Math.floor(W / bars)
    const ledH = Math.floor(H / 20)
    const ledCount = Math.floor(H / (ledH + 1))
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * data.length * 0.7)
      const value = data[idx] / 255
      const activeLeds = Math.ceil(value * ledCount)

      for (let j = 0; j < ledCount; j++) {
        const isActive = j >= (ledCount - activeLeds)
        const isRed = j >= ledCount * 0.9
        const isYellow = j >= ledCount * 0.75
        const y = j * (ledH + 1)
        const x = i * barW + 1

        if (isActive) {
          ctx.fillStyle = isRed ? (T.ledRed || '#ff4444')
            : isYellow ? (T.ledYellow || '#ffaa00')
            : (T.ledGreen || '#4cff88')
          // LED glow
          ctx.shadowColor = ctx.fillStyle
          ctx.shadowBlur = 4
        } else {
          ctx.fillStyle = isRed ? 'rgba(255,0,0,0.08)'
            : 'rgba(0,255,0,0.04)'
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
    const data = this._getFreqData()
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    const cx = W / 2
    const cy = H / 2
    const radius = Math.min(W, H) * 0.3
    const bars = 128

    ctx.save()
    ctx.translate(cx, cy)

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * data.length * 0.6)
      const value = data[idx] / 255
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2
      const barLen = value * radius * 0.8

      const x1 = Math.cos(angle) * (radius - 4)
      const y1 = Math.sin(angle) * (radius - 4)
      const x2 = Math.cos(angle) * (radius + barLen)
      const y2 = Math.sin(angle) * (radius + barLen)

      const alpha = 0.5 + value * 0.5
      ctx.beginPath()
      ctx.strokeStyle = T.accent || '#e8834a'
      ctx.globalAlpha = alpha
      ctx.lineWidth = Math.max(1, (W / bars) * 0.8)
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    // Center circle
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(0, 0, radius - 6, 0, Math.PI * 2)
    ctx.strokeStyle = `${T.accent}44` || 'rgba(232,131,74,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.restore()
  }

  // ── Oscilloscope ─────────────────────────────────────────────────────────
  _drawOscilloscope(W, H) {
    const { ctx } = this
    const data = this._getTimeData()
    const T = this.theme

    ctx.fillStyle = T.lcdBg || '#06070f'
    ctx.fillRect(0, 0, W, H)

    // Grid lines
    ctx.strokeStyle = `${T.accent}20` || 'rgba(232,131,74,0.12)'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
    for (let i = 1; i < 8; i++) {
      const x = (W / 8) * i
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    ctx.shadowColor = T.accent || '#e8834a'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.strokeStyle = T.accent || '#e8834a'
    ctx.lineWidth = 1.5

    for (let i = 0; i < data.length; i++) {
      const v = (data[i] / 128) - 1
      const y = (H / 2) + v * (H * 0.45)
      const x = (i / data.length) * W
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

// ── Compact spectrum for bottom bar ──────────────────────────────────────────
export function drawMiniSpectrum(canvas, analyser, isPlaying, theme, barsRef) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const T = theme

  if (!isPlaying || !analyser) {
    // Idle animation
    ctx.clearRect(0, 0, W, H)
    barsRef.current = barsRef.current.map(v => v * 0.95)
  } else {
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    barsRef.current = barsRef.current.map((_, i) => {
      const idx = Math.floor((i / barsRef.current.length) * data.length * 0.7)
      return data[idx] / 255
    })
  }

  ctx.clearRect(0, 0, W, H)
  const barW = W / barsRef.current.length

  barsRef.current.forEach((v, i) => {
    const h = Math.max(2, v * H)
    const x = i * barW + 0.5
    const y = H - h
    const grad = ctx.createLinearGradient(0, y, 0, H)
    grad.addColorStop(0, T.spectrumTop || '#e8834a')
    grad.addColorStop(1, T.spectrumBottom || '#7a2a08')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, barW - 1.5, h)
  })
}
