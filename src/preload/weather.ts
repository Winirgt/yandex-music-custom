import type { WeatherMode } from '../shared/types'

const CANVAS_ID = 'ymod-weather'
const GLASS_ID = 'ymod-rain-glass'

interface RainDrop {
  x: number
  y: number
  len: number
  speed: number
  width: number
  alpha: number
}

interface GlassDrop {
  x: number
  y: number
  r: number
  vy: number
  sway: number
  phase: number
  trail: Array<{ x: number; y: number; a: number }>
  el: HTMLDivElement | null
}

interface SnowFlake {
  x: number
  y: number
  r: number
  speed: number
  drift: number
  phase: number
  alpha: number
}

/** Weather overlay: rain runs down the screen, snow drifts over the interface. */
export class Weather {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private glassLayer: HTMLDivElement | null = null
  private raf = 0
  private mode: WeatherMode = 'off'
  private intensity = 0.6
  private suspended = false
  private w = 0
  private h = 0
  private t = 0
  private rain: RainDrop[] = []
  private glass: GlassDrop[] = []
  private snow: SnowFlake[] = []

  constructor() {
    window.addEventListener('resize', () => this.resize())
  }

  configure(mode: WeatherMode, intensity: number): void {
    this.mode = mode
    this.intensity = intensity
    if (mode === 'off') {
      this.stop()
      return
    }
    this.ensureCanvas()
    this.resize()
    if (!this.suspended && !this.raf) this.raf = requestAnimationFrame(this.loop)
  }

  /** Minimized window: freeze all particles, music keeps playing. */
  setSuspended(value: boolean): void {
    if (this.suspended === value) return
    this.suspended = value
    if (value) {
      if (this.raf) cancelAnimationFrame(this.raf)
      this.raf = 0
      if (this.glassLayer) this.glassLayer.style.display = 'none'
    } else {
      if (this.glassLayer) this.glassLayer.style.display = ''
      if (this.mode !== 'off' && !this.raf) this.raf = requestAnimationFrame(this.loop)
    }
  }

  private ensureCanvas(): void {
    if (this.canvas && document.getElementById(CANVAS_ID)) return
    const canvas = document.createElement('canvas')
    canvas.id = CANVAS_ID
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.ymodInjected = 'true'
    canvas.style.cssText =
      'position:fixed;inset:0;z-index:-1;pointer-events:none;width:100vw;height:100vh;'
    document.documentElement.appendChild(canvas)
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    if (!this.glassLayer) {
      const layer = document.createElement('div')
      layer.id = GLASS_ID
      layer.setAttribute('aria-hidden', 'true')
      layer.dataset.ymodInjected = 'true'
      layer.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;'
      document.documentElement.appendChild(layer)
      this.glassLayer = layer
    }
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.ctx?.clearRect(0, 0, this.w, this.h)
    this.canvas?.remove()
    this.canvas = null
    this.ctx = null
    this.clearGlassDrops()
    this.glassLayer?.remove()
    this.glassLayer = null
  }

  private clearGlassDrops(): void {
    for (const drop of this.glass) drop.el?.remove()
    this.glass = []
  }

  private resize(): void {
    this.w = window.innerWidth
    this.h = window.innerHeight
    if (this.canvas) {
      this.canvas.width = this.w
      this.canvas.height = this.h
    }
    this.initParticles()
  }

  private initParticles(): void {
    const density = this.intensity
    this.clearGlassDrops()
    if (this.mode === 'rain') {
      const streaks = Math.round((this.w / 12) * density)
      this.rain = Array.from({ length: streaks }, () => ({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        len: 10 + Math.random() * 24,
        speed: 7 + Math.random() * 9,
        width: 0.6 + Math.random() * 1.1,
        alpha: 0.12 + Math.random() * 0.28
      }))
      const blobs = Math.round((this.w / 42) * density)
      this.glass = Array.from({ length: blobs }, () => ({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 2 + Math.random() * 5,
        vy: 0.12 + Math.random() * 0.55,
        sway: 0.1 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        trail: [],
        el: null
      }))
      // Real raindrops on glass: each lens blurs and magnifies the wallpaper behind it.
      const lenses = Math.min(14, Math.max(5, Math.round((this.w / 95) * density)))
      for (let i = 0; i < lenses; i++) {
        const size = 9 + Math.random() * 20
        const el = document.createElement('div')
        el.style.cssText =
          `position:absolute;left:0;top:0;width:${size.toFixed(1)}px;height:${(size * 1.3).toFixed(1)}px;` +
          'border-radius:50%;pointer-events:none;will-change:transform;' +
          'backdrop-filter:blur(3px) brightness(1.1) saturate(1.3);' +
          '-webkit-backdrop-filter:blur(3px) brightness(1.1) saturate(1.3);' +
          'background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.45),rgba(255,255,255,.07) 48%,rgba(0,0,0,.05) 80%);' +
          'box-shadow:inset 0 1px 2px rgba(255,255,255,.6),inset 0 -2px 5px rgba(0,0,0,.2),0 1px 4px rgba(0,0,0,.25);' +
          'border:1px solid rgba(255,255,255,.24);'
        this.glassLayer?.appendChild(el)
        this.glass.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          r: size / 2,
          vy: 0.08 + Math.random() * 0.22,
          sway: 0.15 + Math.random() * 0.3,
          phase: Math.random() * Math.PI * 2,
          trail: [],
          el
        })
      }
    } else if (this.mode === 'snow') {
      const count = Math.round((this.w / 9) * density)
      this.snow = Array.from({ length: count }, () => ({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 1 + Math.random() * 2.6,
        speed: 0.4 + Math.random() * 1.5,
        drift: 0.2 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.55
      }))
    }
  }

  private drawRain(ctx: CanvasRenderingContext2D): void {
    ctx.lineCap = 'round'
    for (const d of this.rain) {
      ctx.strokeStyle = `rgba(190,220,255,${d.alpha})`
      ctx.lineWidth = d.width
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x - d.len * 0.12, d.y + d.len)
      ctx.stroke()
    }
    for (const b of this.glass) {
      b.vy = Math.min(1.2, b.vy + 0.0012)
      b.y += b.vy
      b.x += Math.sin(this.t * 0.02 + b.phase) * b.sway
      if (b.y - b.r > this.h) {
        b.x = Math.random() * this.w
        b.y = -b.r * 2
        b.vy = 0.12 + Math.random() * 0.3
        b.trail = []
      }
      if (Math.random() < 0.35) {
        b.trail.push({ x: b.x, y: b.y, a: 0.22 })
        if (b.trail.length > 12) b.trail.shift()
      }
      for (const p of b.trail) {
        p.a *= 0.965
        ctx.fillStyle = `rgba(200,225,255,${p.a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(0.5, b.r * 0.28), 0, Math.PI * 2)
        ctx.fill()
      }
      if (b.el) {
        const scale = 1 + Math.min(0.45, (b.y / this.h) * 0.35)
        b.el.style.transform =
          `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r * 1.25).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`
      } else {
        const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0.5, b.x, b.y, b.r)
        grad.addColorStop(0, 'rgba(255,255,255,0.55)')
        grad.addColorStop(0.55, 'rgba(180,215,255,0.22)')
        grad.addColorStop(1, 'rgba(160,200,255,0.04)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.ellipse(b.x, b.y, b.r, b.r * 1.25, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private drawSnow(ctx: CanvasRenderingContext2D): void {
    for (const f of this.snow) {
      f.y += f.speed
      f.x += Math.sin(this.t * 0.012 + f.phase) * f.drift
      if (f.y - f.r > this.h) {
        f.y = -f.r * 2
        f.x = Math.random() * this.w
      }
      if (f.x < -10) f.x = this.w + 10
      if (f.x > this.w + 10) f.x = -10
      ctx.fillStyle = `rgba(255,255,255,${f.alpha})`
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private readonly loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    const ctx = this.ctx
    if (!ctx || this.mode === 'off' || this.suspended) return
    this.t++
    ctx.clearRect(0, 0, this.w, this.h)
    if (this.mode === 'rain') this.drawRain(ctx)
    else this.drawSnow(ctx)
  }
}
