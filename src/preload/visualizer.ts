import type { RgbMode, ShakeMode, VisualizerKind } from '../shared/types'

export interface VisualizerSource {
  readFrequency(): Uint8Array
  readTime(): Uint8Array
  /** Отдельный анализатор с минимальным сглаживанием — только для поиска бита. */
  readBeatFrequency?(): Uint8Array
  hasAudio: boolean
  isPlaying: boolean
}

const CANVAS_ID = 'ymod-visualizer'

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [255, 219, 77]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/**
 * Канвас-визуализатор поверх фона, под контентом.
 * Если реального аудио-анализа нет (CORS/нет трека), рисует процедурную
 * анимацию, чтобы визуализатор всё равно жил.
 */
export class Visualizer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private raf = 0
  private suspended = false
  private kind: VisualizerKind = 'off'
  private opacity = 0.5
  private rgb: [number, number, number] = [255, 219, 77]
  private rgbCycle = true
  private rgbMode: RgbMode = 'forward'
  private shakeEnabled = false
  private shakeStrength = 10
  private shakeMode: ShakeMode = 'circular'
  private t = 0
  private beat = 0
  private shakeBeat = 0
  private fluxHistory: number[] = []
  private intervals: number[] = []
  private beatInterval = 500
  private lastBeat = 0
  private readonly prevSpectrum = new Uint8Array(512)
  private readonly playFreq = new Uint8Array(128)
  private readonly playTime = new Uint8Array(256)

  constructor(private readonly source: VisualizerSource) {
    window.addEventListener('resize', () => this.resize())
  }

  configure(kind: VisualizerKind, opacity: number, color: string, rgbCycle = false, rgbMode: RgbMode = 'forward'): void {
    this.kind = kind
    this.opacity = opacity
    this.rgb = hexToRgb(color)
    this.rgbCycle = rgbCycle
    this.rgbMode = rgbMode
    if (kind === 'off') {
      this.stop()
      return
    }
    this.ensureCanvas()
    this.resize()
    this.updateVisibility()
    if (!this.suspended && !this.raf) this.raf = requestAnimationFrame(this.loop)
  }

  /** Окно свёрнуто: полностью останавливаем отрисовку, но не трогаем музыку. */
  setSuspended(value: boolean): void {
    if (this.suspended === value) return
    this.suspended = value
    if (value) {
      if (this.raf) cancelAnimationFrame(this.raf)
      this.raf = 0
      if (this.canvas) this.canvas.style.display = 'none'
      const bg = document.getElementById('ymod-background')
      if (bg) bg.style.transform = ''
    } else {
      if (this.canvas) this.canvas.style.display = ''
      if (this.kind !== 'off' && !this.raf) this.raf = requestAnimationFrame(this.loop)
    }
  }

  configureShake(enabled: boolean, strength: number, mode: ShakeMode = 'circular'): void {
    this.shakeEnabled = enabled
    this.shakeStrength = strength
    this.shakeMode = mode
    if (!enabled) {
      const el = document.getElementById('ymod-background')
      if (el) el.style.transform = ''
    }
  }

  private applyShake(): void {
    const el = document.getElementById('ymod-background')
    if (!el) return
    // Шейк работает только на бите: короткая вспышка дрожи и полное исчезновение
    // между ударами, чтобы не было постоянного движения.
    if (!this.shakeEnabled || this.shakeBeat < 0.04) {
      if (el.style.transform) el.style.transform = ''
      return
    }
    const amp = this.shakeBeat * this.shakeStrength
    let x = 0, y = 0
    // Частоты как в прежнем шейке: быстрая «дрожь» с разными периодами по осям,
    // а не плавное вращение по кругу.
    if (this.shakeMode === 'horizontal') x = Math.sin(this.t * 0.9) * amp
    else if (this.shakeMode === 'vertical') y = Math.sin(this.t * 1.1) * amp
    else {
      x = Math.sin(this.t * 0.9) * amp
      y = Math.cos(this.t * 1.23) * amp * 0.6
    }
    el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(1.06)`
  }

  /** Визуализатор виден на всех вкладках: музыка играет независимо от страницы. */
  private updateVisibility(): void {
    if (!this.canvas) return
    this.canvas.style.display = ''
  }

  private ensureCanvas(): void {
    if (this.canvas && document.getElementById(CANVAS_ID)) return
    const canvas = document.createElement('canvas')
    canvas.id = CANVAS_ID
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.ymodInjected = 'true'
    canvas.style.cssText =
      'position:fixed;inset:0;z-index:-1;pointer-events:none;width:100vw;height:100vh;mix-blend-mode:screen;'
    document.documentElement.appendChild(canvas)
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
  }

  private resize(): void {
    if (!this.canvas) return
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.canvas?.remove()
    this.canvas = null
    this.ctx = null
  }

  private data(): { freq: Uint8Array; time: Uint8Array; beatFreq: Uint8Array } | null {
    if (this.source.hasAudio) {
      return {
        freq: this.source.readFrequency(),
        time: this.source.readTime(),
        beatFreq: this.source.readBeatFrequency?.() ?? this.source.readFrequency()
      }
    }
    // Если играет трек, но анализатор недоступен (CORS/автоплей),keeping visual alive.
    if (this.source.isPlaying) {
      for (let i = 0; i < this.playFreq.length; i++) {
        const wave = Math.sin(this.t * 0.035 + i * 0.16) * 0.5 + 0.5
        const fall = Math.max(0, 1 - i / this.playFreq.length)
        this.playFreq[i] = Math.round(wave * fall * 165)
      }
      for (let i = 0; i < this.playTime.length; i++) {
        this.playTime[i] = 128 + Math.round(Math.sin(this.t * 0.045 + i * 0.08) * 48)
      }
      return { freq: this.playFreq, time: this.playTime, beatFreq: this.playFreq }
    }
    return null
  }

  private currentRgb(): [number, number, number] {
    // forward и sweep: базовый оттенок бежит вперёд; sweep дополнительно
    // раскладывает цвет по полосам (см. drawBars).
    return hslToRgb((this.t * 0.6) % 360, 0.85, 0.6)
  }

  private readonly loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return
    this.t++
    this.updateVisibility()
    if (this.canvas?.style.display === 'none') return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const data = this.data()
    if (!data) return
    ctx.globalAlpha = this.opacity
    const { freq, time, beatFreq } = data
    const [r, g, b] = this.rgbCycle ? this.currentRgb() : this.rgb

    // Детектор бита по спектральному потоку: удар — это резкий прирост
    // сразу нескольких низких частот, а не просто громкий участок.
    let flux = 0
    let energy = 0
    const bins = Math.min(16, beatFreq.length)
    for (let i = 1; i < bins; i++) {
      const d = beatFreq[i] - this.prevSpectrum[i]
      if (d > 0) flux += d
      if (i <= 5) energy += beatFreq[i]
      this.prevSpectrum[i] = beatFreq[i]
    }
    flux /= bins
    // Энергия только низких частот — за ней и едет фон.
    energy /= 5 * 255

    const fh = this.fluxHistory
    fh.push(flux)
    if (fh.length > 60) fh.shift()
    let avg = 0
    for (const v of fh) avg += v
    avg /= fh.length || 1
    let variance = 0
    for (const v of fh) variance += (v - avg) * (v - avg)
    const std = Math.sqrt(variance / (fh.length || 1))

    const now = performance.now()
    const threshold = avg + Math.max(2.5, std * 1.2)
    // Минимум 320 мс = не более 187 BPM, чтобы не ловить один удар несколько раз.
    const isBeat = energy > 0.05 && flux > threshold && now - this.lastBeat > 320

    if (isBeat) {
      if (this.lastBeat > 0) {
        const delta = now - this.lastBeat
        if (delta <= 1100) {
          this.intervals.push(delta)
          if (this.intervals.length > 8) this.intervals.shift()
          const sorted = [...this.intervals].sort((a, b) => a - b)
          const median = sorted[Math.floor(sorted.length / 2)]
          this.beatInterval = Math.min(1100, Math.max(320, this.beatInterval * 0.4 + median * 0.6))
        }
      }
      this.lastBeat = now
      this.beat = 1
      this.shakeBeat = 1
      const dbg = window as unknown as {
        __YMOD_BEAT_DEBUG__?: { count: number; last: number; interval: number; flux: number; threshold: number }
      }
      const prev = dbg.__YMOD_BEAT_DEBUG__
      dbg.__YMOD_BEAT_DEBUG__ = {
        count: (prev?.count ?? 0) + 1,
        last: Math.round(now),
        interval: Math.round(this.beatInterval),
        flux: Number(flux.toFixed(2)),
        threshold: Number(threshold.toFixed(2))
      }
    } else {
      this.beat *= 0.82
      // Быстрое затухание, чтобы между ударами фон был неподвижен.
      this.shakeBeat *= 0.68
    }

    this.applyShake()

    switch (this.kind) {
      case 'bars':
        this.drawBars(ctx, w, h, freq, r, g, b)
        break
      case 'wave':
        this.drawWave(ctx, w, h, time, r, g, b)
        break
      case 'radial':
        this.drawRadial(ctx, w, h, freq, r, g, b)
        break
      case 'rings':
        this.drawRings(ctx, w, h, freq, r, g, b)
        break
      case 'aurora':
        this.drawAurora(ctx, w, h, freq, r, g, b)
        break
      default:
        break
    }
    ctx.globalAlpha = 1
  }

  private drawBars(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    freq: Uint8Array,
    r: number,
    g: number,
    b: number
  ): void {
    const bars = 64
    const gap = 3
    const bw = (w - gap * (bars - 1)) / bars
    for (let i = 0; i < bars; i++) {
      // Логарифмическая шкала частот + подсветка на бите.
      const idx = Math.min(freq.length - 1, Math.floor(Math.pow(i / bars, 1.5) * freq.length * 0.55))
      const v = freq[idx] / 255
      const bh = Math.max(2, v * h * 0.5 * (1 + this.beat * 0.4))
      const x = i * (bw + gap)
      let [br, bg, bb] = [r, g, b]
      if (this.rgbCycle && this.rgbMode === 'sweep') {
        const hue = (((i / bars) + this.t * 0.004) % 1) * 360
        ;[br, bg, bb] = hslToRgb(hue, 0.85, 0.6)
      }
      const grad = ctx.createLinearGradient(0, h - bh, 0, h)
      grad.addColorStop(0, `rgba(${br},${bg},${bb},0.95)`)
      grad.addColorStop(1, `rgba(${br},${bg},${bb},0.12)`)
      ctx.fillStyle = grad
      ctx.fillRect(x, h - bh, bw, bh)
    }
  }

  private drawWave(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: Uint8Array,
    r: number,
    g: number,
    b: number
  ): void {
    ctx.lineWidth = 2.5 + this.beat * 3
    ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`
    ctx.shadowColor = `rgba(${r},${g},${b},0.6)`
    ctx.shadowBlur = 14 + this.beat * 16
    ctx.beginPath()
    const slice = w / time.length
    for (let i = 0; i < time.length; i++) {
      const v = (time[i] - 128) / 128
      const y = h / 2 + v * h * 0.35 * (1 + this.beat * 0.6)
      const x = i * slice
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  private drawRadial(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    freq: Uint8Array,
    r: number,
    g: number,
    b: number
  ): void {
    const cx = w / 2
    const cy = h / 2
    const base = Math.min(w, h) * 0.16
    const spokes = 96
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 0; i < spokes; i++) {
      const v = freq[i % freq.length] / 255
      const angle = (i / spokes) * Math.PI * 2 + this.t * 0.002
      const len = (base + v * Math.min(w, h) * 0.22) * (1 + this.beat * 0.18)
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.25 + v * 0.7})`
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * base, cy + Math.sin(angle) * base)
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
      ctx.stroke()
    }
  }

  private drawRings(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    freq: Uint8Array,
    r: number,
    g: number,
    b: number
  ): void {
    const cx = w / 2
    const cy = h * 0.55
    const maxR = Math.min(w, h) * 0.42
    for (let i = 0; i < 8; i++) {
      const v = freq[Math.min(freq.length - 1, i * 8)] / 255
      const radius = maxR * (0.25 + i * 0.1) * (1 + v * 0.25 + this.beat * 0.08)
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.15 + v * 0.6})`
      ctx.lineWidth = 2 + v * 4
      ctx.beginPath()
      ctx.ellipse(cx, cy, radius, radius * 0.6, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private drawAurora(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    freq: Uint8Array,
    r: number,
    g: number,
    b: number
  ): void {
    let energy = 0
    for (let i = 0; i < 24; i++) energy += freq[i]
    energy /= 24 * 255
    const blobs = 3
    for (let i = 0; i < blobs; i++) {
      const px = w * (0.5 + 0.34 * Math.sin(this.t * 0.004 + i * 2.1))
      const py = h * (0.5 + 0.3 * Math.cos(this.t * 0.003 + i * 1.7))
      const radius = Math.min(w, h) * (0.28 + energy * 0.22 + this.beat * 0.1 + 0.05 * Math.sin(this.t * 0.01 + i))
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius)
      grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }
  }
}
