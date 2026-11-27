// Общие типы для main, preload и renderer.

export type ElementKey =
  | 'ads'
  | 'podcasts'
  | 'subscribe'
  | 'social'
  | 'recommendations'
  | 'vibeFeed'
  | 'vibeHero'
  | 'vibeNews'

/** true = элемент скрыт */
export type HiddenMap = Record<ElementKey, boolean>

export type SidebarKey =
  | 'sidebarAll'
  | 'logo'
  | 'search'
  | 'wave'
  | 'foryou'
  | 'concerts'
  | 'nonmusic'
  | 'kids'
  | 'collection'
  | 'plus'
  | 'pins'

/** true = категория скрыта */
export type SidebarMap = Record<SidebarKey, boolean>

export type PlayerPosition = 'bottom' | 'top' | 'left' | 'right' | 'hidden'

export type BackgroundMode = 'none' | 'gradient' | 'media'
export type MediaKind = 'image' | 'gif' | 'video'

export type GradientId = 'aurora' | 'sunset' | 'midnight' | 'forest' | 'candy' | 'graphite'

export interface BackgroundSettings {
  mode: BackgroundMode
  gradient: GradientId
  /** Путь к картинке / gif / видео в папке данных приложения */
  mediaPath: string | null
  blur: number
  darken: number
  /** Затемнение только для градиентного фона. */
  gradientDarken: number
}

export interface LayoutSettings {
  sidebar: SidebarMap
  playerPosition: PlayerPosition
}

export type VisualizerKind = 'off' | 'bars' | 'wave' | 'radial' | 'rings' | 'aurora'

export type EqPresetId =
  | 'flat'
  | 'bass'
  | 'vocal'
  | 'rock'
  | 'pop'
  | 'electronic'
  | 'classical'
  | 'jazz'
  | 'custom'

export interface AudioSettings {
  eqEnabled: boolean
  eqPreset: EqPresetId
  /** 10 полос, дБ от -12 до +12 */
  eqBands: number[]
  visualizer: VisualizerKind
  visualizerOpacity: number
  visualizerColor: string
  /** Плавное RGB-переливание вместо фиксированного цвета. */
  rgbCycle: boolean
  /** Двигать фон-обои под бит музыки. */
  shakeEnabled: boolean
  /** Амплитуда шейка в пикселях (0..24). */
  shakeStrength: number
  /** Поведение RGB-переливания. */
  rgbMode: RgbMode
  /** Направление движения фона под бит. */
  shakeMode: ShakeMode
}

export type FontId = 'classic' | 'oswald' | 'cormorant' | 'comfortaa' | 'rubik' | 'manrope'
export type RgbMode = 'forward' | 'sweep'
export type ShakeMode = 'circular' | 'horizontal' | 'vertical'

export interface UiSettings {
  accent: string
  panelColor: string
  panelOpacity: number
  glass: boolean
  glassApp: boolean
  glassBlur: number
  glassTint: number
  radius: number
  font: FontId
}

export type WeatherMode = 'off' | 'rain' | 'snow'

export interface WeatherSettings {
  mode: WeatherMode
  intensity: number
}

export interface AppSettings {
  background: BackgroundSettings
  weather: WeatherSettings
  hidden: HiddenMap
  layout: LayoutSettings
  audio: AudioSettings
  ui: UiSettings
  /** Громкость приложения 0..1 — выставляется ползунком в настройках. */
  volume: number
  /** Горячая клавиша открытия меню в формате Electron accelerator. */
  hotkey: string
  /** Показывать «светяшку» / анимацию «Моей волны» Яндекса. */
  yandexGlow: boolean
  /** Скрывать исполнителя/человека с песни. */
  hideArtist: boolean
  /** Закреплена ли плавающая шестерёнка (иначе её можно таскать). */
  gearLocked: boolean
  /** Скрывать описание трека под песней. */
  hideTrackDescription: boolean
  /** Стекло было выключено автоматически из-за обоев — вернуть при их удалении. */
  glassAutoDisabled: boolean
  /** Недавно выбранные обои (пути), чтобы не искать файл каждый раз. */
  mediaHistory: string[]
  showFloatingButton: boolean
  activeProfile: string
}

export interface SettingsPatch {
  background?: Partial<BackgroundSettings>
  weather?: Partial<WeatherSettings>
  hidden?: Partial<HiddenMap>
  layout?: Partial<LayoutSettings> & { sidebar?: Partial<SidebarMap> }
  audio?: Partial<AudioSettings>
  ui?: Partial<UiSettings>
  volume?: number
  hotkey?: string
  yandexGlow?: boolean
  hideArtist?: boolean
  hideTrackDescription?: boolean
  gearLocked?: boolean
  showFloatingButton?: boolean
}

export interface SettingsPayload {
  settings: AppSettings
  /** URL фона через внутренний протокол ymod-media:// (или null) */
  backgroundUrl: string | null
  backgroundKind: MediaKind | null
  /** Data-URL превью выбранного фона (jpg/gif), чтобы окно настроек его показывало. */
  mediaPreviewData: string | null
  /** История обоев с превью и типом для категорий. */
  mediaHistoryPreviews: Array<{ path: string; kind: MediaKind; data: string | null }>
  appVersion: string
}

export interface AudioStatus {
  attached: boolean
  reason: 'ok' | 'no-audio' | 'cors' | 'error' | 'idle'
}

export interface ProfilePreset {
  id: string
  name: string
  description: string
  background: BackgroundSettings
  hidden: HiddenMap
  layout: LayoutSettings
  audio: AudioSettings
  ui: UiSettings
}

export interface SettingsApi {
  getSettings(): Promise<SettingsPayload>
  update(patch: SettingsPatch): Promise<SettingsPayload>
  chooseMedia(): Promise<SettingsPayload | null>
  selectMediaPath(path: string): Promise<SettingsPayload | null>
  clearMedia(): Promise<SettingsPayload>
  applyProfile(profileId: string): Promise<SettingsPayload>
  resetAll(): Promise<SettingsPayload>
  getAudioStatus(): Promise<AudioStatus>
  reattachAudio(): void
  onAudioStatus(callback: (status: AudioStatus) => void): void
  close(): void
  onRequestClose(callback: () => void): void
}
