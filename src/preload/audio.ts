import type { AudioSettings, AudioStatus } from '../shared/types'
import { EQ_FREQUENCIES } from '../shared/presets'

/**
 * Эквалайзер + анализатор на Web Audio API.
 * Граф: media element -> 10 BiquadFilter -> Analyser -> destination.
 * Источники кэшируются: createMediaElementSource можно вызвать только один раз
 * на элемент, поэтому при переподключении переиспользуем уже созданный узел.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private sources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>()
  private source: MediaElementAudioSourceNode | null = null
  private filters: BiquadFilterNode[] = []
  private analyser: AnalyserNode | null = null
  private beatAnalyser: AnalyserNode | null = null
  private attachedEl: HTMLMediaElement | null = null
  private usingCaptured = false
  private attachedGroup: unknown = null
  private attaching = false
  private settings: AudioSettings | null = null
  private retryTimer = 0
  private status: AudioStatus = { attached: false, reason: 'idle' }
  private readonly onStatus: (status: AudioStatus) => void

  readonly freqData = new Uint8Array(512)
  readonly timeData = new Uint8Array(512)
  readonly beatFreqData = new Uint8Array(256)

  constructor(onStatus: (status: AudioStatus) => void) {
    this.onStatus = onStatus
    const resume = (): void => void this.ctx?.resume()
    window.addEventListener('pointerdown', resume, { passive: true })
    window.addEventListener('keydown', resume)
    // Глобальная команда из окна настроек («Переподключить звук»).
    ;(window as unknown as { __YMOD_REATTACH_AUDIO__?: () => void }).__YMOD_REATTACH_AUDIO__ = () => this.forceAttach()
  }

  get hasAudio(): boolean {
    return this.status.attached
  }

  get isPlaying(): boolean {
    return this.mediaList().some(
      (el) => !el.paused && !el.ended && ((el.currentSrc || el.src || '').length > 0 || !!el.srcObject)
    )
  }

  private mediaList(): HTMLMediaElement[] {
    const registry = (window as unknown as { __YMOD_MEDIA__?: Set<HTMLMediaElement> }).__YMOD_MEDIA__
    return registry
      ? Array.from(registry)
      : (Array.from(document.querySelectorAll('audio,video')) as unknown as HTMLMediaElement[])
  }

  private debug(extra: Record<string, unknown> = {}): void {
    ;(window as unknown as { __YMOD_AUDIO_DEBUG__?: unknown }).__YMOD_AUDIO_DEBUG__ = {
      ...((window as unknown as { __YMOD_AUDIO_DEBUG__?: object }).__YMOD_AUDIO_DEBUG__ ?? {}),
      attached: this.status.attached,
      reason: this.status.reason,
      src: (this.attachedEl?.currentSrc || this.attachedEl?.src || '').slice(0, 90),
      gains: this.filters.map((f) => Math.round(f.gain.value * 10) / 10),
      eqEnabled: this.settings?.eqEnabled,
      captured: this.usingCaptured,
      groupSrc: ((this.attachedGroup as { el?: HTMLMediaElement } | null)?.el?.currentSrc || '').slice(0, 60),
      filterCount: this.filters.length,
      ...extra
    }
  }

  private setStatus(status: AudioStatus): void {
    this.status = status
    this.debug()
    this.onStatus(status)
  }

  notifyAudio(): void {
    if (!this.settings) return
    if (this.settings.eqEnabled || this.settings.visualizer !== 'off') void this.tryAttach()
  }

  forceAttach(): void {
    this.attachedEl = null
    this.source = null
    this.filters = []
    this.analyser = null
    try { this.beatAnalyser?.disconnect() } catch { /* ignore */ }
    this.beatAnalyser = null
    if (this.ctx) void this.ctx.resume()
    void this.tryAttach()
  }

  update(settings: AudioSettings): void {
    this.settings = settings
    this.applyGains()
    const needsGraph = settings.eqEnabled || settings.visualizer !== 'off'
    if (needsGraph) {
      void this.tryAttach()
      if (!this.retryTimer) {
        this.retryTimer = window.setInterval(() => {
          if (!this.settings || this.status.attached) return
          void this.tryAttach()
        }, 700)
      }
    } else if (this.retryTimer) {
      window.clearInterval(this.retryTimer)
      this.retryTimer = 0
    }
  }

  private applyGains(): void {
    if (!this.settings || this.filters.length === 0) return
    const bands = this.settings.eqEnabled ? this.settings.eqBands : EQ_FREQUENCIES.map(() => 0)
    const t = this.ctx?.currentTime ?? 0
    this.filters.forEach((filter, i) => {
      const value = typeof bands[i] === 'number' ? bands[i] : 0
      try {
        filter.gain.cancelScheduledValues(t)
        filter.gain.setValueAtTime(value, t)
      } catch { /* ignore */ }
      // Непосредственная установка: отложенная automation может не проявиться
      // в приостановленном контексте, а пользователь ждёт мгновенного эффекта.
      try { filter.gain.value = value } catch { /* ignore */ }
    })
    this.debug()
  }

  private findAudio(): HTMLMediaElement | null {
    const usable = this.mediaList().filter((el) => {
      const src = el.currentSrc || el.src || ''
      if (src.startsWith('ymod-media://') || src.startsWith('data:image')) return false
      return src.length > 0 || !!el.srcObject
    })
    usable.sort((a, b) => {
      if (a.paused !== b.paused) return a.paused ? 1 : -1
      return (b.currentSrc || b.src || '').length - (a.currentSrc || a.src || '').length
    })
    return usable[0] ?? null
  }

  private capture(): {
    groups: Array<{
      ctx: AudioContext
      el: HTMLMediaElement
      source: MediaElementAudioSourceNode
      filters: BiquadFilterNode[]
      analyser: AnalyserNode | null
      tap: AnalyserNode | null
    }>
  } | null {
    return (window as unknown as {
      __YMOD_AUDIO_CAPTURE__?: {
        groups: Array<{
          ctx: AudioContext
          el: HTMLMediaElement
          source: MediaElementAudioSourceNode
          filters: BiquadFilterNode[]
          analyser: AnalyserNode | null
          tap: AnalyserNode | null
        }>
      }
    }).__YMOD_AUDIO_CAPTURE__ ?? null
  }

  private async tryAttach(): Promise<void> {
    if (this.attaching) return

    // Приоритет — готовый граф Яндекса: второй MediaElementSource сделать нельзя.
    const cap = this.capture()
    const groups = cap?.groups ?? []
    const scored = groups
      .filter((g) => !/splash|loading|advert/i.test(g.el.currentSrc || g.el.src || ''))
      .map((g) => {
        const src = g.el.currentSrc || g.el.src || ''
        const playing = !g.el.paused && !g.el.ended
        const hasEq = g.filters.length >= EQ_FREQUENCIES.length
        return { g, score: (playing ? 1000 : 0) + (hasEq ? 100 : 0) + Math.min(50, src.length / 100) }
      })
      .sort((a, b) => b.score - a.score)
    const group = scored[0]?.g
    if (group) {
      try {
        if (this.attachedGroup === group && this.status.attached) return
        // ВАЖНО: использовать ctx именно этого графа, иначе connect() упадёт.
        const ctx = group.ctx
        if (this.ctx && this.ctx !== ctx) {
          try { this.source?.disconnect(); this.analyser?.disconnect(); this.beatAnalyser?.disconnect(); this.filters.forEach((f) => f.disconnect()) } catch { /* ignore */ }
          this.ctx = null
          this.beatAnalyser = null
        }
        this.ctx = ctx
        await ctx.resume()
        this.source = group.source
        this.usingCaptured = true
        let analyser = group.tap
        if (!analyser) {
          analyser = ctx.createAnalyser()
          const sink = ctx.createGain()
          sink.gain.value = 0
          group.source.connect(analyser)
          analyser.connect(sink)
          sink.connect(ctx.destination)
          group.tap = analyser
        }
        // Визуализатор использует прежнее плавное сглаживание — так столбики
        // не дёргаются. Точный поиск бита идёт по отдельному анализатору ниже.
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.68
        this.analyser = analyser

        if (group.filters.length >= EQ_FREQUENCIES.length) {
          this.filters = group.filters.slice(-EQ_FREQUENCIES.length)
        } else {
          // У Яндекса нет полос для этого трека — вставляем свои между source и destination.
          const flag = window as unknown as { __YMOD_CREATING_OWN_FILTERS__?: boolean }
          flag.__YMOD_CREATING_OWN_FILTERS__ = true
          try {
            this.filters = EQ_FREQUENCIES.map((frequency, i) => {
              const f = ctx.createBiquadFilter()
              f.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
              f.frequency.value = frequency
              f.Q.value = 1.1
              f.gain.value = 0
              return f
            })
          } finally {
            flag.__YMOD_CREATING_OWN_FILTERS__ = false
          }
          try { group.source.disconnect() } catch { /* ignore */ }
          let node: AudioNode = group.source
          for (const f of this.filters) { node.connect(f); node = f }
          node.connect(ctx.destination)
          // disconnect() убрал и наш анализатор — подключаем его обратно к источнику.
          if (analyser) group.source.connect(analyser)
        }
        // Отдельный анализатор с минимальным сглаживанием — нужен только для
        // точного попадания шейка в бит и не меняет вид визуализатора.
        try { this.beatAnalyser?.disconnect() } catch { /* ignore */ }
        const beat = ctx.createAnalyser()
        beat.fftSize = 512
        beat.smoothingTimeConstant = 0.15
        const beatSink = ctx.createGain()
        beatSink.gain.value = 0
        // Слушаем сигнал после эквалайзера: детектор должен реагировать на то,
        // что реально слышно, а не на «сырой» источник до фильтров.
        const beatSource: AudioNode = this.filters.length ? this.filters[this.filters.length - 1] : group.source
        beatSource.connect(beat)
        beat.connect(beatSink)
        beatSink.connect(ctx.destination)
        this.beatAnalyser = beat

        this.attachedGroup = group
        this.attachedEl = null
        this.applyGains()
        this.setStatus({ attached: true, reason: 'ok' })
      } catch (error) {
        this.setStatus({ attached: false, reason: 'error' })
        this.debug({ error: String(error) })
      }
      return
    }

    this.usingCaptured = false
    const el = this.findAudio()
    if (!el) {
      if (!this.status.attached) this.setStatus({ attached: false, reason: 'no-audio' })
      return
    }
    if (this.attachedEl === el && this.status.attached) return

    this.attaching = true
    try {
      if (!this.ctx) this.ctx = new AudioContext()
      const ctx = this.ctx
      await ctx.resume()

      let source = this.sources.get(el)
      if (!source) {
        source = ctx.createMediaElementSource(el)
        this.sources.set(el, source)
      }
      // Отключаем только предыдущий Graф, но не сам переиспользуемый source.
      if (this.source && this.source !== source) {
        try { this.source.disconnect() } catch { /* ignore */ }
      }
      this.filters.forEach((f) => { try { f.disconnect() } catch { /* ignore */ } })
      try { this.analyser?.disconnect() } catch { /* ignore */ }

      this.source = source
      this.filters = EQ_FREQUENCIES.map((frequency, i) => {
        const filter = ctx.createBiquadFilter()
        filter.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
        filter.frequency.value = frequency
        filter.Q.value = 1.1
        filter.gain.value = 0
        return filter
      })
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.75

      let node: AudioNode = source
      for (const filter of this.filters) {
        node.connect(filter)
        node = filter
      }
      node.connect(this.analyser)
      this.analyser.connect(ctx.destination)

      try { this.beatAnalyser?.disconnect() } catch { /* ignore */ }
      this.beatAnalyser = ctx.createAnalyser()
      this.beatAnalyser.fftSize = 512
      this.beatAnalyser.smoothingTimeConstant = 0.15
      const beatSink = ctx.createGain()
      beatSink.gain.value = 0
      node.connect(this.beatAnalyser)
      this.beatAnalyser.connect(beatSink)
      beatSink.connect(ctx.destination)

      this.attachedEl = el
      this.applyGains()
      this.setStatus({ attached: true, reason: 'ok' })
    } catch (error) {
      this.setStatus({ attached: false, reason: 'error' })
      this.debug({ error: String(error) })
    } finally {
      this.attaching = false
    }
  }

  readFrequency(): Uint8Array {
    if (this.analyser && this.status.attached) this.analyser.getByteFrequencyData(this.freqData)
    return this.freqData
  }

  readTime(): Uint8Array {
    if (this.analyser && this.status.attached) this.analyser.getByteTimeDomainData(this.timeData)
    return this.timeData
  }

  readBeatFrequency(): Uint8Array {
    if (this.beatAnalyser && this.status.attached) this.beatAnalyser.getByteFrequencyData(this.beatFreqData)
    return this.beatFreqData
  }
}
