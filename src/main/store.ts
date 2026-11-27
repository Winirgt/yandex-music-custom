import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AppSettings,
  AudioSettings,
  BackgroundMode,
  BackgroundSettings,
  EqPresetId,
  GradientId,
  HiddenMap,
  LayoutSettings,
  PlayerPosition,
  SettingsPatch,
  SidebarMap,
  UiSettings,
  VisualizerKind,
  FontId,
  WeatherSettings
} from '../shared/types'
import {
  DEFAULT_SETTINGS,
  GRADIENTS,
  PROFILES,
  cloneSettings,
  eqPresetBands,
  profileSettings
} from '../shared/presets'

const HIDDEN_KEYS: (keyof HiddenMap)[] = [
  'ads', 'podcasts', 'subscribe', 'social', 'recommendations',
  'vibeFeed', 'vibeHero', 'vibeNews'
]
const SIDEBAR_KEYS: (keyof SidebarMap)[] = [
  'sidebarAll', 'logo', 'search', 'wave', 'foryou', 'concerts',
  'nonmusic', 'kids', 'collection', 'plus', 'pins'
]
const PLAYER_POSITIONS: PlayerPosition[] = ['bottom', 'top', 'left', 'right', 'hidden']
const VISUALIZERS: VisualizerKind[] = ['off', 'bars', 'wave', 'radial', 'rings', 'aurora']
const EQ_PRESET_IDS: EqPresetId[] = ['flat', 'bass', 'vocal', 'rock', 'pop', 'electronic', 'classical', 'jazz', 'custom']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function isGeneratedBackground(path: string): boolean {
  try {
    return dirname(path).toLowerCase() === join(app.getPath('userData'), 'backgrounds').toLowerCase()
  } catch {
    return false
  }
}

function sanitizeBackground(raw: unknown, fallback: BackgroundSettings): BackgroundSettings {
  if (!isRecord(raw)) return { ...fallback }
  const mode: BackgroundMode =
    raw.mode === 'none' || raw.mode === 'gradient' || raw.mode === 'media' ? raw.mode : fallback.mode
  const gradientIds = GRADIENTS.map((g) => g.id) as string[]
  const gradient: GradientId =
    typeof raw.gradient === 'string' && gradientIds.includes(raw.gradient)
      ? (raw.gradient as GradientId)
      : fallback.gradient
  let mediaPath = typeof raw.mediaPath === 'string' && raw.mediaPath.length > 0 ? raw.mediaPath : null
  if (mediaPath && !existsSync(mediaPath)) mediaPath = null
  return {
    mode: mediaPath ? mode : mode === 'media' ? 'none' : mode,
    gradient,
    mediaPath,
    blur: clamp(Number(raw.blur), 0, 32),
    darken: clamp(Number(raw.darken), 0, 0.85),
    gradientDarken: clamp(Number(raw.gradientDarken ?? fallback.gradientDarken), 0, 0.85)
  }
}

function sanitizeHidden(raw: unknown, fallback: HiddenMap): HiddenMap {
  const result: HiddenMap = { ...fallback }
  if (!isRecord(raw)) return result
  for (const key of HIDDEN_KEYS) if (typeof raw[key] === 'boolean') result[key] = raw[key]
  return result
}

function sanitizeSidebar(raw: unknown, fallback: SidebarMap): SidebarMap {
  const result: SidebarMap = { ...fallback }
  if (!isRecord(raw)) return result
  for (const key of SIDEBAR_KEYS) if (typeof raw[key] === 'boolean') result[key] = raw[key]
  return result
}

function sanitizeLayout(raw: unknown, fallback: LayoutSettings): LayoutSettings {
  if (!isRecord(raw)) return { sidebar: { ...fallback.sidebar }, playerPosition: fallback.playerPosition }
  const playerPosition: PlayerPosition =
    typeof raw.playerPosition === 'string' && (PLAYER_POSITIONS as string[]).includes(raw.playerPosition)
      ? (raw.playerPosition as PlayerPosition)
      : fallback.playerPosition
  return { sidebar: sanitizeSidebar(raw.sidebar, fallback.sidebar), playerPosition }
}

function sanitizeAudio(raw: unknown, fallback: AudioSettings): AudioSettings {
  if (!isRecord(raw)) return { ...fallback, eqBands: [...fallback.eqBands] }
  const eqPreset: EqPresetId =
    typeof raw.eqPreset === 'string' && (EQ_PRESET_IDS as string[]).includes(raw.eqPreset)
      ? (raw.eqPreset as EqPresetId)
      : fallback.eqPreset
  const visualizer: VisualizerKind =
    typeof raw.visualizer === 'string' && (VISUALIZERS as string[]).includes(raw.visualizer)
      ? (raw.visualizer as VisualizerKind)
      : fallback.visualizer
  let bands = Array.isArray(raw.eqBands) ? raw.eqBands.map((n) => clamp(Number(n), -12, 12)) : []
  if (bands.length !== 10) bands = eqPresetBands(eqPreset === 'custom' ? 'flat' : eqPreset)
  const color = typeof raw.visualizerColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.visualizerColor)
    ? raw.visualizerColor
    : fallback.visualizerColor
  return {
    eqEnabled: typeof raw.eqEnabled === 'boolean' ? raw.eqEnabled : fallback.eqEnabled,
    eqPreset,
    eqBands: bands,
    visualizer,
    visualizerOpacity: clamp(Number(raw.visualizerOpacity), 0.05, 1),
    visualizerColor: color,
    rgbCycle: typeof raw.rgbCycle === 'boolean' ? raw.rgbCycle : fallback.rgbCycle,
    shakeEnabled: typeof raw.shakeEnabled === 'boolean' ? raw.shakeEnabled : fallback.shakeEnabled,
    shakeStrength: Math.min(24, Math.max(0, Number(raw.shakeStrength ?? fallback.shakeStrength))),
    rgbMode: (['forward', 'sweep'] as string[]).includes(String(raw.rgbMode))
      ? (raw.rgbMode as AudioSettings['rgbMode'])
      : fallback.rgbMode,
    shakeMode: (['circular', 'horizontal', 'vertical'] as string[]).includes(String(raw.shakeMode))
      ? (raw.shakeMode as AudioSettings['shakeMode'])
      : fallback.shakeMode
  }
}

function sanitizeUi(raw: unknown, fallback: UiSettings): UiSettings {
  if (!isRecord(raw)) return { ...fallback }
  const hex = (v: unknown, d: string): string =>
    typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d
  const fonts: FontId[] = ['classic', 'oswald', 'cormorant', 'comfortaa', 'rubik', 'manrope']
  const legacyFonts: Record<string, FontId> = { montserrat: 'rubik', unbounded: 'oswald', inter: 'oswald', golos: 'cormorant' }
  const requested = typeof raw.font === 'string' ? raw.font : ''
  const mapped = legacyFonts[requested] ?? requested
  const font: FontId = (fonts as string[]).includes(mapped) ? (mapped as FontId) : fallback.font
  return {
    accent: hex(raw.accent, fallback.accent),
    panelColor: hex(raw.panelColor, fallback.panelColor),
    panelOpacity: clamp(Number(raw.panelOpacity), 0.15, 1),
    glass: typeof raw.glass === 'boolean' ? raw.glass : fallback.glass,
    glassApp: typeof raw.glassApp === 'boolean' ? raw.glassApp : fallback.glassApp,
    glassBlur: clamp(Number(raw.glassBlur), 0, 40),
    glassTint: clamp(Number(raw.glassTint), 0.05, 0.9),
    radius: clamp(Number(raw.radius), 0, 32),
    font
  }
}

function sanitizeWeather(raw: unknown, fallback: WeatherSettings): WeatherSettings {
  if (!isRecord(raw)) return { ...fallback }
  const mode = raw.mode === 'rain' || raw.mode === 'snow' || raw.mode === 'off' ? raw.mode : fallback.mode
  return { mode, intensity: clamp(Number(raw.intensity ?? fallback.intensity), 0.1, 1) }
}

function sanitize(raw: unknown): AppSettings {
  const base = cloneSettings(DEFAULT_SETTINGS)
  if (!isRecord(raw)) return base
  return {
    background: sanitizeBackground(raw.background, base.background),
    weather: sanitizeWeather(raw.weather, base.weather),
    hidden: sanitizeHidden(raw.hidden, base.hidden),
    layout: sanitizeLayout(raw.layout, base.layout),
    audio: sanitizeAudio(raw.audio, base.audio),
    ui: sanitizeUi(raw.ui, base.ui),
    volume: Math.min(1, Math.max(0, Number(raw.volume ?? base.volume))),
    hotkey: typeof raw.hotkey === 'string' && raw.hotkey.length > 2 ? raw.hotkey : base.hotkey,
    yandexGlow: typeof raw.yandexGlow === 'boolean' ? raw.yandexGlow : base.yandexGlow,
    hideArtist: typeof raw.hideArtist === 'boolean' ? raw.hideArtist : base.hideArtist,
    hideTrackDescription: typeof raw.hideTrackDescription === 'boolean' ? raw.hideTrackDescription : base.hideTrackDescription,
    glassAutoDisabled: typeof raw.glassAutoDisabled === 'boolean' ? raw.glassAutoDisabled : base.glassAutoDisabled,
    mediaHistory: Array.isArray(raw.mediaHistory)
      ? raw.mediaHistory
          .filter((p): p is string =>
            typeof p === 'string' && existsSync(p) && !isGeneratedBackground(p)
          )
          .filter((p, i, arr) => arr.indexOf(p) === i)
          .slice(0, 12)
      : [],
    gearLocked: typeof raw.gearLocked === 'boolean' ? raw.gearLocked : base.gearLocked,
    showFloatingButton: typeof raw.showFloatingButton === 'boolean' ? raw.showFloatingButton : true,
    activeProfile: typeof raw.activeProfile === 'string' ? raw.activeProfile : 'custom'
  }
}

export class SettingsStore {
  private readonly filePath: string
  private settings: AppSettings

  constructor() {
    // Отдельное имя файла: официальное приложение может перезаписывать свой
    // settings.json в том же userData и затирать настройки мода при выходе.
    this.filePath = join(app.getPath('userData'), 'ymod-settings.json')
    this.settings = this.load()
  }

  get(): AppSettings {
    return cloneSettings(this.settings)
  }

  update(patch: SettingsPatch): AppSettings {
    const next = cloneSettings(this.settings)
    if (patch.background) {
      next.background = sanitizeBackground({ ...next.background, ...patch.background }, next.background)
    }
    if (patch.hidden) next.hidden = sanitizeHidden({ ...next.hidden, ...patch.hidden }, next.hidden)
    if (patch.layout) {
      next.layout = sanitizeLayout(
        {
          sidebar: { ...next.layout.sidebar, ...(patch.layout.sidebar ?? {}) },
          playerPosition: patch.layout.playerPosition ?? next.layout.playerPosition
        },
        next.layout
      )
    }
    if (patch.weather) next.weather = sanitizeWeather({ ...next.weather, ...patch.weather }, next.weather)
    if (patch.audio) next.audio = sanitizeAudio({ ...next.audio, ...patch.audio }, next.audio)
    if (patch.ui) next.ui = sanitizeUi({ ...next.ui, ...patch.ui }, next.ui)
    if (typeof patch.volume === 'number') next.volume = Math.min(1, Math.max(0, patch.volume))
    if (typeof patch.hotkey === 'string') next.hotkey = patch.hotkey
    if (typeof patch.yandexGlow === 'boolean') next.yandexGlow = patch.yandexGlow
    if (typeof patch.hideArtist === 'boolean') next.hideArtist = patch.hideArtist
    if (typeof patch.hideTrackDescription === 'boolean') next.hideTrackDescription = patch.hideTrackDescription
    if (typeof patch.gearLocked === 'boolean') next.gearLocked = patch.gearLocked
    if (typeof patch.showFloatingButton === 'boolean') next.showFloatingButton = patch.showFloatingButton
    next.activeProfile = 'custom'
    this.settings = sanitize(next)
    this.save()
    return this.get()
  }

  applyProfile(profileId: string): AppSettings {
    const profile = PROFILES.find((p) => p.id === profileId)
    if (!profile) return this.get()
    this.settings = sanitize(profileSettings(profile))
    this.save()
    return this.get()
  }

  setMedia(mediaPath: string): AppSettings {
    const next = cloneSettings(this.settings)
    next.background.mediaPath = mediaPath
    next.background.mode = 'media'
    next.activeProfile = 'custom'
    this.settings = sanitize(next)
    this.save()
    return this.get()
  }

  addMediaHistory(path: string): AppSettings {
    if (!path || !existsSync(path) || isGeneratedBackground(path)) return this.get()
    const next = cloneSettings(this.settings)
    next.mediaHistory = [path, ...next.mediaHistory.filter((p) => p !== path)].slice(0, 12)
    this.settings = sanitize(next)
    this.save()
    return this.get()
  }

  clearMedia(): AppSettings {
    const next = cloneSettings(this.settings)
    next.background.mediaPath = null
    next.background.mode = 'none'
    next.activeProfile = 'custom'
    this.settings = sanitize(next)
    this.save()
    return this.get()
  }

  reset(): AppSettings {
    this.settings = cloneSettings(DEFAULT_SETTINGS)
    this.save()
    return this.get()
  }

  private load(): AppSettings {
    try {
      if (!existsSync(this.filePath)) {
        // Миграция со старого имени файла.
        const legacy = join(dirname(this.filePath), 'settings.json')
        if (existsSync(legacy)) {
          const migrated = sanitize(JSON.parse(readFileSync(legacy, 'utf8')))
          writeFileSync(this.filePath, JSON.stringify(migrated, null, 2), 'utf8')
          return migrated
        }
        return cloneSettings(DEFAULT_SETTINGS)
      }
      return sanitize(JSON.parse(readFileSync(this.filePath, 'utf8')))
    } catch (error) {
      console.error('[store] Не удалось прочитать settings.json:', error)
      try {
        writeFileSync(`${this.filePath}.broken`, existsSync(this.filePath) ? readFileSync(this.filePath) : '')
      } catch {
        // ignore
      }
      return cloneSettings(DEFAULT_SETTINGS)
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8')
    } catch (error) {
      console.error('[store] Не удалось сохранить settings.json:', error)
    }
  }
}
