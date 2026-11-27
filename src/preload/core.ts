import type { HiddenMap, SettingsPayload, SidebarMap } from '../shared/types'
import { FONTS, getGradient } from '../shared/presets'
import { FONT_DATA } from '../shared/font-data'
import {
  HIDE_KEYS,
  HIDE_SELECTORS,
  SIDEBAR_KEYS,
  SIDEBAR_RULES,
  ALWAYS_HIDE_SELECTORS,
  ALWAYS_HIDE_TEXTS
} from './selectors'
import { AudioEngine } from './audio'
import { Visualizer } from './visualizer'
import { Weather } from './weather'

/** Абстракция связи с main-процессом: IPC (обёртка) или WebSocket (мод в оф. приложении). */
export interface Transport {
  send(channel: string, data?: unknown): void
  invoke<T>(channel: string, data?: unknown): Promise<T>
  on(channel: string, callback: (data: never) => void): void
}

const BASE_STYLE_ID = 'ymod-base-style'
const HIDE_STYLE_ID = 'ymod-hide-style'
const TRANSPARENCY_STYLE_ID = 'ymod-transparency-style'
const GLASS_STYLE_ID = 'ymod-glass-style'
const BACKGROUND_ID = 'ymod-background'
const BACKGROUND_VIDEO_ID = 'ymod-background-video'
const BACKGROUND_GIF_ID = 'ymod-background-gif'
const DARKEN_ID = 'ymod-background-darken'
const BUTTON_ID = 'ymod-open-settings'
const FONT_STYLE_ID = 'ymod-font-style'
const GLASS_BACKDROP_ID = 'ymod-glass-backdrop'

const FONT_FACE_CSS = FONT_DATA.map(
  (f) =>
    `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/ttf;base64,${f.data}) format('truetype');}`
).join('\n')

/** Один размытый слой вместо десятков прямоугольных карточек. */
const GLASS_BACKDROP_CSS = `
  #${GLASS_BACKDROP_ID} {
    position: fixed; inset: 0; z-index: -4; pointer-events: none;
    backdrop-filter: blur(var(--ymod-glass-blur-strength, 22px)) saturate(180%);
    -webkit-backdrop-filter: blur(var(--ymod-glass-blur-strength, 22px)) saturate(180%);
    background: rgba(18, 20, 28, 0.18);
  }
`

const BASE_CSS = `
  #${BUTTON_ID} {
    position: fixed; right: 22px; bottom: 98px; z-index: 2147483600;
    width: 46px; height: 46px; padding: 0;
    border: 2px solid rgba(255,255,255,0.28); border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(16,18,24,0.78); color: #ffdb4d;
    box-shadow: 0 10px 28px rgba(0,0,0,0.38);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    cursor: pointer; opacity: 0;
    animation: ymod-button-in 0.35s ease 0.35s forwards;
    transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }
  #${BUTTON_ID}:hover { background: rgba(30,33,42,0.95); box-shadow: 0 14px 34px rgba(0,0,0,0.5); transform: translateY(-2px) scale(1.06); }
  #${BUTTON_ID}:active { transform: scale(0.94); }
  #${BUTTON_ID} svg { width: 22px; height: 22px; display: block; }
  @keyframes ymod-button-in { to { opacity: 0.95; } }

  #${BACKGROUND_ID} {
    position: fixed; inset: 0; z-index: -3; pointer-events: none;
    background-position: center center; background-size: cover; background-repeat: no-repeat;
    transform: scale(1.06); transform-origin: center center;
    transition: filter 0.35s ease, opacity 0.35s ease;
    overflow: hidden;
  }
  #${BACKGROUND_VIDEO_ID}, #${BACKGROUND_GIF_ID} {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; object-position: center center; pointer-events: none;
  }
  #${DARKEN_ID} { position: fixed; inset: 0; z-index: -2; pointer-events: none; transition: background 0.35s ease; }
  [data-ymod-hidden="true"] { display: none !important; }
  /* Floating UI marks background layers inert while a popup is open — they must stay
     in the layout, otherwise the whole interface disappears on the "..." menu. */
  [data-floating-ui-inert] { pointer-events: none !important; }
  /* Плеер главного экрана не должен отображаться на других вкладках. */
  html:not(.ymod-main-page) [data-test-id="VIBE_PLAYERBAR"] { display: none !important; }
  /* Свёрнутое окно: тяжёлые слои не рисуются, музыка продолжает играть. */
  html.ymod-suspended #ymod-visualizer,
  html.ymod-suspended #ymod-weather,
  html.ymod-suspended #ymod-rain-glass,
  html.ymod-suspended #ymod-background-video,
  html.ymod-suspended #ymod-background-gif,
  html.ymod-suspended #ymod-glass-backdrop { display: none !important; }
  html.ymod-suspended #ymod-background { filter: none !important; transition: none !important; }
`

const TRANSPARENCY_CSS = `
  html, body { background: transparent !important; background-color: transparent !important; }
  #app, [class*="App_root"], [class*="Page_root"] { background-color: transparent !important; }
  [class*="CommonLayout_root" i] { background-image: none !important; background-color: transparent !important; }
  [class*="DefaultLayout_root" i] { background: transparent !important; }
`

const APP_GLASS_CSS = `
  html, body { background: transparent !important; background-color: transparent !important; }
  /* Границы окна, но НИКАКИХ прямоугольников поверх элементов приложения. */
  html { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.26), inset 0 0 0 3px rgba(0,0,0,0.4); }
  #app, [class*="App_root"], [class*="DefaultLayout_root" i] {
    background-color: transparent !important;
    background-image: none !important;
  }
  /* Стекло на вкладках, но не на главном экране с плеером. */
  html:not(.ymod-main-page) [class*="Content_main" i] {
    background-color: rgba(18, 20, 28, var(--ymod-glass-alpha, 0.62)) !important;
    backdrop-filter: blur(var(--ymod-glass-blur-strength, 22px)) saturate(180%);
    -webkit-backdrop-filter: blur(var(--ymod-glass-blur-strength, 22px)) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 18px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22) !important;
  }
` + GLASS_BACKDROP_CSS

/** «Светяшка» / анимация «Моей волны» Яндекса — управляется классом на <html>. */
const GLOW_STYLE_ID = 'ymod-glow-style'
const ARTIST_STYLE_ID = 'ymod-artist-style'
const TRACK_DESC_STYLE_ID = 'ymod-track-desc-style'
const YANDEX_GLOW_CSS = `
  html.ymod-glow-off [class*="VibePage_bigCardPanelBackground" i],
  html.ymod-glow-off [class*="VibeWidgetAnimation" i],
  html.ymod-glow-off [class*="VibePage_vibeAnimation" i] {
    opacity: 0 !important; visibility: hidden !important; display: none !important;
  }
`

/** Скрытие исполнителя/человека с песни. */
const ARTIST_HIDE_CSS = `
  html.ymod-hide-artist [class*="VibeDynamicArtists" i],
  html.ymod-hide-artist [class*="VibePage_text" i],
  html.ymod-hide-artist [class*="VibePage_entityMeta" i],
  html.ymod-hide-artist [class*="AlbumCover_root" i],
  html.ymod-hide-artist [class*="VibePage_albumCover" i],
  html.ymod-hide-artist [data-test-id="ARTIST"] { display: none !important; visibility: hidden !important; }
`

/** Описание трека под названием песни. */
const TRACK_DESC_CSS = `
  html.ymod-hide-track-desc [class*="VibePage_text" i],
  html.ymod-hide-track-desc [class*="VibePage_description" i],
  html.ymod-hide-track-desc [class*="VibePage_words" i],
  html.ymod-hide-track-desc [class*="WordsCard" i],
  html.ymod-hide-track-desc [class*="TrackDescription" i],
  html.ymod-hide-track-desc [data-test-id="WORDS_CARD_TEXT"],
  html.ymod-hide-track-desc [data-test-id*="TRACK_DESCRIPTION" i] {
    display: none !important; visibility: hidden !important;
  }
`

const GEAR_SVG = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94L14.4 2.81a.5.5 0 0 0-.48-.41h-3.84a.5.5 0 0 0-.47.41L9.25 5.35a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.59.22L2.73 8.87a.5.5 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32a.5.5 0 0 0 .59.22l2.39-.96a7 7 0 0 0 1.62.94l.36 2.54a.5.5 0 0 0 .48.41h3.84a.5.5 0 0 0 .47-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
  </svg>
`

export function startInjector(transport: Transport): void {
  // Перехватываем создание медиа-элементов: Яндекс не держит <audio> в DOM,
  // поэтому document.querySelector('audio') не находит реальный трек.
  const media = (window as unknown as { __YMOD_MEDIA__?: Set<HTMLMediaElement> }).__YMOD_MEDIA__ ?? new Set<HTMLMediaElement>()
  ;(window as unknown as { __YMOD_MEDIA__?: Set<HTMLMediaElement> }).__YMOD_MEDIA__ = media
  const createElement = Document.prototype.createElement as (tagName: string, options?: ElementCreationOptions) => HTMLElement
  Document.prototype.createElement = function (this: Document, tagName: string, options?: ElementCreationOptions): HTMLElement {
    const el = (createElement as (...args: unknown[]) => HTMLElement).call(this, tagName, options)
    if (tagName.toLowerCase() === 'audio' || tagName.toLowerCase() === 'video') {
      media.add(el as unknown as HTMLMediaElement)
    }
    return el
  } as typeof Document.prototype.createElement
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (): Promise<void> {
    media.add(this)
    return play.call(this)
  }
  document.addEventListener('play', (event) => media.add(event.target as HTMLMediaElement), true)

  // Яндекс сам строит Web Audio-граф. Перехватываем каждый граф отдельно:
  // у него может быть несколько аудио (заставка, трек, реклама), и второй
  // MediaElementSource на тот же элемент создать нельзя.
  interface AudioGraphCapture {
    ctx: AudioContext
    el: HTMLMediaElement
    source: MediaElementAudioSourceNode
    filters: BiquadFilterNode[]
    analyser: AnalyserNode | null
    tap: AnalyserNode | null
  }
  interface AudioCapture {
    groups: AudioGraphCapture[]
    patched?: boolean
  }
  const captureHolder = window as unknown as { __YMOD_AUDIO_CAPTURE__?: AudioCapture }
  const capture: AudioCapture = captureHolder.__YMOD_AUDIO_CAPTURE__ ?? { groups: [] }
  captureHolder.__YMOD_AUDIO_CAPTURE__ = capture
  if (!capture.patched) {
    capture.patched = true
    let currentGroup: AudioGraphCapture | null = null
    const ctxProto = AudioContext.prototype as unknown as {
      createMediaElementSource(el: HTMLMediaElement): MediaElementAudioSourceNode
      createAnalyser(): AnalyserNode
      createBiquadFilter(): BiquadFilterNode
    }
    const origSource = ctxProto.createMediaElementSource
    ctxProto.createMediaElementSource = function (this: AudioContext, el: HTMLMediaElement): MediaElementAudioSourceNode {
      const node = origSource.call(this, el)
      const group: AudioGraphCapture = { ctx: this, el, source: node, filters: [], analyser: null, tap: null }
      capture.groups.push(group)
      currentGroup = group
      return node
    }
    const origAnalyser = ctxProto.createAnalyser
    ctxProto.createAnalyser = function (this: AudioContext): AnalyserNode {
      const node = origAnalyser.call(this)
      if (currentGroup && currentGroup.ctx === this && !currentGroup.analyser) currentGroup.analyser = node
      return node
    }
    const origBiquad = ctxProto.createBiquadFilter
    ctxProto.createBiquadFilter = function (this: AudioContext): BiquadFilterNode {
      const node = origBiquad.call(this)
      const own = (window as unknown as { __YMOD_CREATING_OWN_FILTERS__?: boolean }).__YMOD_CREATING_OWN_FILTERS__
      if (!own && currentGroup && currentGroup.ctx === this) currentGroup.filters.push(node)
      return node
    }
  }

  const matchesHotkey = (event: KeyboardEvent, hotkey: string): boolean => {
    const parts = hotkey.split('+').map((p) => p.trim().toLowerCase())
    const key = parts[parts.length - 1]
    const wants = (name: string): boolean => parts.includes(name)
    const eventKey = event.key.toLowerCase()
    const keyMatch = key === 'space' ? eventKey === ' ' : eventKey === key || event.code.toLowerCase() === `key${key}`
    return (
      keyMatch &&
      event.ctrlKey === wants('ctrl') &&
      event.altKey === wants('alt') &&
      event.shiftKey === wants('shift') &&
      event.metaKey === wants('meta')
    )
  }
  window.addEventListener('keydown', (event) => {
    if (!current || !matchesHotkey(event, current.settings.hotkey)) return
    event.preventDefault()
    transport.send('settings:toggle')
  })

  // Отмечаем главную страницу с плеером, чтобы не применять к ней стекло вкладок.
  const updateMainPageClass = (): void => {
    if (document.hidden) return
    const url = location.href
    const isMain = /^music-application:\/\/desktop\/?$/.test(url) || /music\.yandex\.ru\/?$/.test(url) || /vibe/i.test(url)
    document.documentElement.classList.toggle('ymod-main-page', isMain)
  }
  const pageClassHolder = window as unknown as { __YMOD_PAGE_CLASS_TIMER__?: number }
  if (!pageClassHolder.__YMOD_PAGE_CLASS_TIMER__) {
    updateMainPageClass()
    pageClassHolder.__YMOD_PAGE_CLASS_TIMER__ = window.setInterval(updateMainPageClass, 400)
  }

  // Electron-полноэкранный режим Яндекса не всегда вызывает fullscreenchange,
  // поэтому определяем его по размеру окна относительно экрана.
  const fsHolder = window as unknown as { __YMOD_FS_HANDLER__?: boolean }
  if (!fsHolder.__YMOD_FS_HANDLER__) {
    fsHolder.__YMOD_FS_HANDLER__ = true
    let beforeFullscreen: { left: string; top: string; right: string; bottom: string } | null = null
    let wasFullscreen = false
    const syncFullscreen = (): void => {
      if (document.hidden) return
      const isFullscreen =
        !!document.fullscreenElement ||
        (screen.width > 0 && window.innerWidth >= screen.width - 2 && window.innerHeight >= screen.height - 2)
      document.documentElement.classList.toggle('ymod-fullscreen', isFullscreen)
      if (isFullscreen === wasFullscreen) return
      const btn = document.getElementById(BUTTON_ID) as HTMLElement | null
      if (btn) {
        if (isFullscreen) {
          beforeFullscreen = {
            left: btn.style.left,
            top: btn.style.top,
            right: btn.style.right,
            bottom: btn.style.bottom
          }
          btn.style.left = ''
          btn.style.top = '70px'
          btn.style.right = '22px'
          btn.style.bottom = 'auto'
        } else {
          const restore = beforeFullscreen
          const rect = btn.getBoundingClientRect()
          const savedX = parseFloat(restore?.left || '')
          const savedY = parseFloat(restore?.top || '')
          const valid = restore && Number.isFinite(savedX) && Number.isFinite(savedY) &&
            savedX >= 0 && savedY >= 0 && savedX < window.innerWidth - 40 && savedY < window.innerHeight - 40
          if (valid) {
            btn.style.left = restore!.left
            btn.style.top = restore!.top
            btn.style.right = restore!.right
            btn.style.bottom = restore!.bottom
          } else {
            // Если старая позиция была за пределами окна — ставим в правый верхний угол.
            btn.style.left = ''
            btn.style.top = '70px'
            btn.style.right = '22px'
            btn.style.bottom = 'auto'
          }
          beforeFullscreen = null
          void rect
        }
      }
      wasFullscreen = isFullscreen
    }
    window.addEventListener('resize', syncFullscreen)
    window.setInterval(syncFullscreen, 500)
    syncFullscreen()
  }

  let current: SettingsPayload | null = null
  let activeHideSelectors: string[] = []
  let observer: MutationObserver | null = null
  let applyQueued = false
  let suspended = false
  let backgroundVideoEl: HTMLVideoElement | null = null

  const engine = new AudioEngine((status) => transport.send('audio:status', status))
  const visualizer = new Visualizer(engine)
  const weather = new Weather()

  // Сворачивание окна: ставим на паузу только тяжёлые визуальные части.
  // Аудиограф AudioEngine не трогается — музыка должна продолжать играть.
  const applySuspension = (): void => {
    const next = document.hidden
    if (next === suspended) return
    suspended = next
    document.documentElement.classList.toggle('ymod-suspended', suspended)
    visualizer.setSuspended(suspended)
    weather.setSuspended(suspended)
    if (suspended) {
      try { backgroundVideoEl?.pause() } catch { /* ignore */ }
    } else {
      const video = backgroundVideoEl
      if (video && video.isConnected && video.readyState >= 2) {
        void video.play().catch(() => undefined)
      }
    }
  }
  document.addEventListener('visibilitychange', applySuspension)
  applySuspension()

  const styleRoot = (): HTMLElement => document.head ?? document.documentElement

  const ensureStyle = (id: string): HTMLStyleElement => {
    let element = document.getElementById(id) as HTMLStyleElement | null
    if (!element) {
      element = document.createElement('style')
      element.id = id
      element.dataset.ymodInjected = 'true'
      styleRoot().appendChild(element)
    }
    return element
  }

  const setText = (id: string, css: string): void => {
    const element = ensureStyle(id)
    if (element.textContent !== css) element.textContent = css
  }

  const buildHideCss = (hidden: HiddenMap, sidebar: SidebarMap): string => {
    const blocks: string[] = []
    blocks.push(`/* always */\n${ALWAYS_HIDE_SELECTORS.join(',\n')} { display: none !important; }`)
    for (const key of HIDE_KEYS) {
      if (!hidden[key]) continue
      const selectors = HIDE_SELECTORS[key]
      if (selectors.length) blocks.push(`/* ${key} */\n${selectors.join(',\n')} { display: none !important; }`)
    }
    for (const key of SIDEBAR_KEYS) {
      if (!sidebar[key]) continue
      const selectors = SIDEBAR_RULES[key].selectors
      if (selectors.length) blocks.push(`/* sidebar:${key} */\n${selectors.join(',\n')} { display: none !important; }`)
    }
    return blocks.join('\n')
  }

  const markAlwaysText = (root: Element): void => {
    const sel =
      '[class*="Banner" i], [class*="Download" i], [class*="Windows" i], [class*="promo" i], [class*="Modal" i], [class*="Overlay" i], [class*="Landing" i]'
    const candidates: Element[] = Array.from(root.querySelectorAll(sel))
    try {
      if (root.matches(sel)) candidates.push(root)
    } catch {
      // ignore
    }
    const marked: Element[] = []
    candidates.forEach((el) => {
      // never hide the whole app: e.g. WithTopBanner_root contains the "Музыка на Windows"
      // banner as a descendant, hiding it would blank the entire interface.
      if (isAppContainer(el)) return
      // Hide only the outermost non-app element; its children are hidden with it.
      if (marked.some((parent) => parent.contains(el))) return
      const text = el.textContent ?? ''
      if (!ALWAYS_HIDE_TEXTS.some((t) => text.includes(t))) return
      el.setAttribute('data-ymod-hidden', 'true')
      marked.push(el)
    })
  }

  const isAppContainer = (el: Element): boolean =>
    !!el.querySelector('[class*="Navbar_root" i], [class*="Content_main" i], audio')

  const markPromo = (el: Element): void => {
    if (el.tagName === 'IFRAME') {
      const src = (el as HTMLIFrameElement).src || ''
      if (/plus|multipodpiska|landing|promo/i.test(src)) el.setAttribute('data-ymod-hidden', 'true')
      return
    }
    if (isAppContainer(el)) return
    const text = el.textContent ?? ''
    if (!ALWAYS_HIDE_TEXTS.some((t) => text.includes(t))) return
    if (el.getBoundingClientRect().width > 400) el.setAttribute('data-ymod-hidden', 'true')
  }

  const scanPromoPortals = (): void => {
    document.querySelectorAll('body > div, body > div > div, body > iframe, iframe').forEach((el) => {
      markPromo(el)
    })
  }

  const markHide = (root: Element): void => {
    for (const selector of activeHideSelectors) {
      try {
        if (root.matches(selector)) root.setAttribute('data-ymod-hidden', 'true')
        root.querySelectorAll(selector).forEach((n) => n.setAttribute('data-ymod-hidden', 'true'))
      } catch {
        // ignore
      }
    }
    markAlwaysText(root)
  }

  const markSidebar = (root: Element, sidebar: SidebarMap): void => {
    for (const key of SIDEBAR_KEYS) {
      if (!sidebar[key]) continue
      const rule = SIDEBAR_RULES[key]
      const hide = (el: Element): void => {
        const target = rule.ancestor ? (el.closest(rule.ancestor) ?? el) : el
        target.setAttribute('data-ymod-hidden', 'true')
      }
      for (const selector of rule.selectors) {
        try {
          if (root.matches(selector)) hide(root)
          root.querySelectorAll(selector).forEach(hide)
        } catch {
          // ignore
        }
      }
      if (rule.text) {
        root
          .querySelectorAll('nav a, nav button, aside a, aside button, [class*="Navbar"] a, [class*="Navbar"] button')
          .forEach((el) => {
            if ((el.textContent ?? '').trim() === rule.text) hide(el)
          })
        if (root.matches('a,button') && (root.textContent ?? '').trim() === rule.text) hide(root)
      }
    }
  }

  const fullScan = (): void => {
    if (!current) return
    document.querySelectorAll('[data-ymod-hidden]').forEach((n) => n.removeAttribute('data-ymod-hidden'))
    const root = document.documentElement
    if (!root) return
    markHide(root)
    markSidebar(root, current.settings.layout.sidebar)
    scanPromoPortals()
  }

  const ensureBackgroundLayer = (): { layer: HTMLDivElement; darken: HTMLDivElement } => {
    let layer = document.getElementById(BACKGROUND_ID) as HTMLDivElement | null
    let darken = document.getElementById(DARKEN_ID) as HTMLDivElement | null
    if (!layer) {
      layer = document.createElement('div')
      layer.id = BACKGROUND_ID
      layer.setAttribute('aria-hidden', 'true')
      layer.dataset.ymodInjected = 'true'
      document.documentElement.appendChild(layer)
    }
    if (!darken) {
      darken = document.createElement('div')
      darken.id = DARKEN_ID
      darken.setAttribute('aria-hidden', 'true')
      darken.dataset.ymodInjected = 'true'
      document.documentElement.appendChild(darken)
    }
    return { layer, darken }
  }

  const applyBackground = (payload: SettingsPayload): void => {
    const { background } = payload.settings
    const transparency = document.getElementById(TRANSPARENCY_STYLE_ID) as HTMLStyleElement | null
    if (background.mode === 'none') {
      document.getElementById(BACKGROUND_ID)?.remove()
      document.getElementById(DARKEN_ID)?.remove()
      backgroundVideoEl = null
      // Стекло всего приложения тоже требует прозрачной подложки.
      if (!current?.settings.ui.glassApp) transparency?.remove()
      return
    }
    const { layer, darken } = ensureBackgroundLayer()
    let video = document.getElementById(BACKGROUND_VIDEO_ID) as HTMLVideoElement | null
    if (background.mode === 'media' && payload.backgroundKind === 'video' && payload.backgroundUrl) {
      layer.style.backgroundImage = 'none'
      if (!video) {
        video = document.createElement('video')
        video.id = BACKGROUND_VIDEO_ID
        video.muted = true
        video.loop = true
        video.autoplay = true
        video.playsInline = true
        video.setAttribute('aria-hidden', 'true')
        layer.appendChild(video)
      }
      const videoEl = video
      if (!videoEl) return
      backgroundVideoEl = videoEl
      if (!videoEl.dataset.ymodLoopBound) {
        videoEl.dataset.ymodLoopBound = '1'
        const restart = (): void => {
          if (document.hidden) return
          // Без load(): он сбрасывает декодер и даёт чёрный кадр на стыке цикла.
          try {
            videoEl.currentTime = 0
          } catch { /* ignore */ }
          void videoEl.play().catch(() => undefined)
        }
        videoEl.onended = restart
        videoEl.addEventListener('ended', restart)
        videoEl.addEventListener('seeked', () => {
          if (videoEl.duration && videoEl.duration - videoEl.currentTime < 1.2) restart()
        })
        videoEl.addEventListener('timeupdate', () => {
          if (videoEl.duration && videoEl.duration - videoEl.currentTime < 1.2) restart()
        })
        videoEl.addEventListener('canplay', () => void videoEl.play().catch(() => undefined))
        // Надёжная петля: events sometimes не приходят для ymod-media://.
        const holder = window as unknown as { __YMOD_VIDEO_LOOP_TIMER__?: number }
        if (holder.__YMOD_VIDEO_LOOP_TIMER__) window.clearInterval(holder.__YMOD_VIDEO_LOOP_TIMER__)
        holder.__YMOD_VIDEO_LOOP_TIMER__ = window.setInterval(() => {
          if (!videoEl.isConnected) {
            window.clearInterval(holder.__YMOD_VIDEO_LOOP_TIMER__)
            holder.__YMOD_VIDEO_LOOP_TIMER__ = undefined
            return
          }
          if (document.hidden) return
          if (!videoEl.duration) return
          // Chromium sometimes pauses a hidden video and forgets to resume it.
          if (videoEl.paused) void videoEl.play().catch(() => undefined)
          const nearEnd = videoEl.duration - videoEl.currentTime < 1.2
          const stuckAtEnd = videoEl.paused && videoEl.currentTime > videoEl.duration * 0.9
          if (nearEnd || stuckAtEnd) restart()
        }, 250)
      }
      if (videoEl.src !== payload.backgroundUrl) {
        videoEl.src = payload.backgroundUrl
        videoEl.load()
      }
      if (!document.hidden) void videoEl.play().catch(() => undefined)
    } else {
      video?.remove()
      backgroundVideoEl = null
      const gif = document.getElementById(BACKGROUND_GIF_ID) as HTMLImageElement | null
      if (background.mode === 'media' && payload.backgroundUrl && payload.backgroundKind === 'gif') {
        // Отдельный <img> надёжнее анимирует GIF, чем CSS background-image.
        const img = gif ?? document.createElement('img')
        img.id = BACKGROUND_GIF_ID
        img.alt = ''
        img.setAttribute('aria-hidden', 'true')
        if (img.src !== payload.backgroundUrl) img.src = payload.backgroundUrl
        if (!img.isConnected) layer.appendChild(img)
        layer.style.backgroundImage = 'none'
      } else {
        gif?.remove()
        layer.style.backgroundImage =
          background.mode === 'media' && payload.backgroundUrl
            ? `url("${payload.backgroundUrl}")`
            : getGradient(background.gradient).css
      }
    }
    layer.style.filter = background.blur > 0 ? `blur(${background.blur}px)` : 'none'
    const darkenValue = background.mode === 'gradient' ? background.gradientDarken : background.darken
    darken.style.background = `rgba(0, 0, 0, ${darkenValue})`
    if (!transparency) {
      const style = document.createElement('style')
      style.id = TRANSPARENCY_STYLE_ID
      style.dataset.ymodInjected = 'true'
      style.textContent = TRANSPARENCY_CSS
      styleRoot().appendChild(style)
    }
  }

  // Границы шестерёнки: не заезжать на кнопки окна сверху и на категории слева.
  const clampGear = (x: number, y: number): { x: number; y: number } => {
    const minX = Math.min(220, Math.max(0, window.innerWidth - 60))
    const maxX = Math.max(minX, window.innerWidth - 60)
    const minY = Math.min(72, Math.max(0, window.innerHeight - 60))
    const maxY = Math.max(minY, window.innerHeight - 60)
    return {
      x: Math.round(Math.max(minX, Math.min(maxX, x))),
      y: Math.round(Math.max(minY, Math.min(maxY, y)))
    }
  }
  const reclampGear = (): void => {
    const btn = document.getElementById(BUTTON_ID) as HTMLElement | null
    if (!btn) return
    const x = parseFloat(btn.style.left)
    const y = parseFloat(btn.style.top)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const pos = clampGear(x, y)
      btn.style.left = `${pos.x}px`
      btn.style.top = `${pos.y}px`
    }
  }
  window.addEventListener('resize', reclampGear)

  const ensureSettingsButton = (show: boolean): void => {
    const existing = document.getElementById(BUTTON_ID) as HTMLButtonElement | null
    if (!show) {
      existing?.remove()
      return
    }
    if (existing) return
    const button = document.createElement('button')
    button.id = BUTTON_ID
    button.type = 'button'
    button.title = 'Настройки (Ctrl+Shift+M)'
    button.setAttribute('aria-label', 'Открыть или закрыть настройки')
    button.dataset.ymodInjected = 'true'
    button.innerHTML = GEAR_SVG

    const savedPos = ((): { x: number; y: number } | null => {
      try {
        const raw = localStorage.getItem('ymod-gear-pos')
        const parsed = raw ? JSON.parse(raw) : null
        return parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) ? parsed : null
      } catch {
        return null
      }
    })()
    if (savedPos && !current?.settings.gearLocked) {
      const pos = clampGear(savedPos.x, savedPos.y)
      button.style.left = `${pos.x}px`
      button.style.top = `${pos.y}px`
      button.style.right = 'auto'
      button.style.bottom = 'auto'
    } else {
      // В закреплённом состоянии привязываемся к краям — при изменении
      // размера окна кнопка автоматически остаётся в правом верхнем углу.
      button.style.left = ''
      button.style.right = '22px'
      button.style.top = '70px'
      button.style.bottom = 'auto'
    }

    let dragging = false
    let dragMoved = false
    let startX = 0
    let startY = 0
    let originX = 0
    let originY = 0
    button.addEventListener('click', () => {
      if (dragMoved) { dragMoved = false; return }
      transport.send('settings:toggle')
    })
    button.addEventListener('pointerdown', (event) => {
      if (current?.settings.gearLocked) return
      dragging = true
      dragMoved = false
      startX = event.clientX
      startY = event.clientY
      const rect = button.getBoundingClientRect()
      originX = rect.left
      originY = rect.top
      button.style.left = `${originX}px`
      button.style.top = `${originY}px`
      button.style.right = 'auto'
      button.style.bottom = 'auto'
      button.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener('pointermove', (event) => {
      if (!dragging) return
      const pos = clampGear(originX + event.clientX - startX, originY + event.clientY - startY)
      button.style.left = `${pos.x}px`
      button.style.top = `${pos.y}px`
      if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) dragMoved = true
    })
    button.addEventListener('pointerup', (event) => {
      if (!dragging) return
      dragging = false
      try { button.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
      try {
        localStorage.setItem('ymod-gear-pos', JSON.stringify({ x: parseFloat(button.style.left), y: parseFloat(button.style.top) }))
      } catch { /* ignore */ }
    })
    document.documentElement.appendChild(button)
  }

  const applyPayload = (payload: SettingsPayload): void => {
    current = payload
    const settings = payload.settings
    ensureStyle(BASE_STYLE_ID).textContent = BASE_CSS
    setText(HIDE_STYLE_ID, buildHideCss(settings.hidden, settings.layout.sidebar))
    setText(GLOW_STYLE_ID, YANDEX_GLOW_CSS)
    setText(ARTIST_STYLE_ID, ARTIST_HIDE_CSS)
    setText(TRACK_DESC_STYLE_ID, TRACK_DESC_CSS)
    document.documentElement.classList.toggle('ymod-glow-off', !settings.yandexGlow)
    document.documentElement.classList.toggle('ymod-hide-artist', settings.hideArtist)
    document.documentElement.classList.toggle('ymod-hide-track-desc', settings.hideTrackDescription)
    activeHideSelectors = [...ALWAYS_HIDE_SELECTORS]
    for (const key of HIDE_KEYS) if (settings.hidden[key]) activeHideSelectors.push(...HIDE_SELECTORS[key])
    applyBackground(payload)
    ensureSettingsButton(settings.showFloatingButton)
    const gear = document.getElementById(BUTTON_ID)
    if (gear) {
      gear.title = `Настройки (${settings.hotkey})`
      gear.style.cursor = settings.gearLocked ? 'pointer' : 'grab'
      if (settings.gearLocked) {
        // Возврат к краю окна — работает и после изменения размера окна.
        gear.style.left = ''
        gear.style.right = '22px'
        gear.style.top = '70px'
        gear.style.bottom = 'auto'
        try { localStorage.removeItem('ymod-gear-pos') } catch { /* ignore */ }
      } else if (!gear.style.left && !gear.style.top) {
        const rect = gear.getBoundingClientRect()
        const pos = clampGear(rect.left, rect.top)
        gear.style.left = `${pos.x}px`
        gear.style.top = `${pos.y}px`
        gear.style.right = 'auto'
        gear.style.bottom = 'auto'
      }
    }
    const transparency = document.getElementById(TRANSPARENCY_STYLE_ID) as HTMLStyleElement | null
    const glass = document.getElementById(GLASS_STYLE_ID) as HTMLStyleElement | null
    if (settings.ui.glassApp) {
      document.documentElement.style.setProperty('--ymod-glass-blur-strength', `${settings.ui.glassBlur}px`)
      document.documentElement.style.setProperty('--ymod-glass-alpha', String(settings.ui.glassTint))
      if (!transparency) {
        const tr = document.createElement('style')
        tr.id = TRANSPARENCY_STYLE_ID
        tr.dataset.ymodInjected = 'true'
        tr.textContent = TRANSPARENCY_CSS
        styleRoot().appendChild(tr)
      }
      const style = glass ?? ensureStyle(GLASS_STYLE_ID)
      if (style.textContent !== APP_GLASS_CSS) style.textContent = APP_GLASS_CSS
    } else {
      glass?.remove()
      if (settings.background.mode === 'none') transparency?.remove()
    }
    const selected = FONTS.find((f) => f.id === settings.ui.font)
    const selectedFamily = selected?.family.split(',')[0].replace(/"/g, '') ?? ''
    const aliasFamilies = [
      'YS Text',
      'Yandex Sans Text',
      'YS Text Display',
      'Yandex Sans',
      'YSMusic Headline'
    ]
    const aliasCss = FONT_DATA.filter((f) => f.family === selectedFamily)
      .map((f) =>
        aliasFamilies
          .map(
            (family) =>
              `@font-face{font-family:'${family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/ttf;base64,${f.data}) format('truetype');}`
          )
          .join('\n')
      )
      .join('\n')
    const css = FONT_FACE_CSS + aliasCss
    const fontStyle = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null
    if (!fontStyle) ensureStyle(FONT_STYLE_ID).textContent = css
    else if (fontStyle.textContent !== css) fontStyle.textContent = css
    if (selectedFamily) {
      const fam = `'${selectedFamily}'`
      document.documentElement.style.setProperty('--ym-font-text', fam)
      document.documentElement.style.setProperty('--ym-font-heading', fam)
      document.documentElement.style.setProperty('--ym-font-family-text', fam)
      document.documentElement.style.setProperty('--toastify-font-family', fam)
    }

    let backdrop = document.getElementById(GLASS_BACKDROP_ID)
    if (settings.ui.glassApp && !backdrop) {
      backdrop = document.createElement('div')
      backdrop.id = GLASS_BACKDROP_ID
      backdrop.dataset.ymodInjected = 'true'
      document.documentElement.appendChild(backdrop)
    } else if (!settings.ui.glassApp) {
      backdrop?.remove()
    }
    if (backdrop) {
      const filter = `blur(${settings.ui.glassBlur}px) saturate(180%)`
      backdrop.style.backdropFilter = filter
      ;(backdrop.style as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter = filter
      // При нулевом размытии слой полностью прозрачный.
      backdrop.style.background = settings.ui.glassBlur > 0 ? 'rgba(18,20,28,0.18)' : 'transparent'
    }

    engine.update(settings.audio)
    visualizer.configure(
      settings.audio.visualizer,
      settings.audio.visualizerOpacity,
      settings.audio.visualizerColor,
      settings.audio.rgbCycle,
      settings.audio.rgbMode
    )
    visualizer.configureShake(settings.audio.shakeEnabled, settings.audio.shakeStrength, settings.audio.shakeMode)
    weather.configure(settings.weather.mode, settings.weather.intensity)
    fullScan()
  }

  const scheduleApply = (): void => {
    if (applyQueued) return
    applyQueued = true
    window.setTimeout(() => {
      applyQueued = false
      if (current) applyPayload(current)
    }, 150)
  }

  const startObserver = (): void => {
    if (observer) return
    const target = document.documentElement
    if (!target) return
    observer = new MutationObserver((mutations) => {
      if (!current || document.hidden) return
      let shouldReapply = false
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return
          const el = node as Element
          markHide(el)
          markSidebar(el, current!.settings.layout.sidebar)
          markPromo(el)
          if (el.tagName === 'AUDIO' || el.querySelector('audio')) engine.notifyAudio()
        })
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return
          const el = node as Element
          if (el.id?.startsWith('ymod-')) shouldReapply = true
        })
      }
      if (shouldReapply) scheduleApply()
    })
    observer.observe(target, { childList: true, subtree: true })
    window.setInterval(() => {
      if (!current || document.hidden) return
      const bgActive = current.settings.background.mode !== 'none'
      if (
        !document.getElementById(BASE_STYLE_ID) ||
        !document.getElementById(HIDE_STYLE_ID) ||
        (bgActive && !document.getElementById(BACKGROUND_ID)) ||
        (bgActive && !document.getElementById(TRANSPARENCY_STYLE_ID)) ||
        (current.settings.showFloatingButton && !document.getElementById(BUTTON_ID))
      ) {
        scheduleApply()
      }
      engine.notifyAudio()
    }, 2000)
  }

  const start = (): void => {
    ensureStyle(BASE_STYLE_ID).textContent = BASE_CSS
    startObserver()
    window.addEventListener(
      'keydown',
      (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
          event.preventDefault()
          event.stopPropagation()
          transport.send('settings:toggle')
        }
      },
      true
    )
    transport
      .invoke<SettingsPayload>('settings:get')
      .then((payload) => applyPayload(payload))
      .catch((error) => console.error('[ymod] Не удалось получить настройки:', error))
    transport.on('settings:changed', ((payload: SettingsPayload) => applyPayload(payload)) as (data: never) => void)
  }

  if (document.documentElement) start()
  else window.addEventListener('DOMContentLoaded', start, { once: true })
}
