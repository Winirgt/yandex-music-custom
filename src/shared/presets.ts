import type {
  AppSettings,
  AudioSettings,
  BackgroundSettings,
  EqPresetId,
  FontId,
  GradientId,
  HiddenMap,
  LayoutSettings,
  ProfilePreset,
  SidebarMap,
  UiSettings
} from './types'

export interface GradientDefinition {
  id: GradientId
  name: string
  css: string
}

export const GRADIENTS: GradientDefinition[] = [
  { id: 'aurora', name: 'Аврора', css: 'linear-gradient(135deg, #0b1020 0%, #142a6e 32%, #6d28d9 66%, #db2777 100%)' },
  { id: 'sunset', name: 'Закат', css: 'linear-gradient(135deg, #1a0b2e 0%, #7c2d12 40%, #ea580c 70%, #facc15 100%)' },
  { id: 'midnight', name: 'Полночь', css: 'linear-gradient(160deg, #05070d 0%, #0f172a 48%, #1e293b 100%)' },
  { id: 'forest', name: 'Лес', css: 'linear-gradient(135deg, #04140f 0%, #064e3b 45%, #15803d 78%, #84cc16 100%)' },
  { id: 'candy', name: 'Карамель', css: 'linear-gradient(135deg, #2e1065 0%, #7e22ce 35%, #ec4899 68%, #f97316 100%)' },
  { id: 'graphite', name: 'Графит', css: 'linear-gradient(150deg, #0a0a0a 0%, #171717 45%, #262626 100%)' }
]

export function getGradient(id: GradientId): GradientDefinition {
  return GRADIENTS.find((g) => g.id === id) ?? GRADIENTS[0]
}

/** Частоты 10-полосного эквалайзера, Гц */
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export const EQ_PRESETS: { id: EqPresetId; name: string; bands: number[] }[] = [
  { id: 'flat', name: 'Ровный', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Бас', bands: [7, 6, 5, 3, 1, 0, 0, 0, 1, 2] },
  { id: 'vocal', name: 'Вокал', bands: [-2, -1, 0, 2, 4, 4, 3, 2, 1, 0] },
  { id: 'rock', name: 'Рок', bands: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4] },
  { id: 'pop', name: 'Поп', bands: [-1, 1, 3, 4, 3, 1, 0, 1, 2, 3] },
  { id: 'electronic', name: 'Электроника', bands: [6, 5, 2, 0, -2, 1, 0, 2, 5, 6] },
  { id: 'classical', name: 'Классика', bands: [3, 2, 1, 0, 0, 0, 1, 2, 3, 4] },
  { id: 'jazz', name: 'Джаз', bands: [3, 2, 1, 1, -1, -1, 0, 1, 2, 3] }
]

export function eqPresetBands(id: EqPresetId): number[] {
  const preset = EQ_PRESETS.find((p) => p.id === id)
  return preset ? [...preset.bands] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

export const FONTS: { id: FontId; name: string; family: string; lh: number; ls: string }[] = [
  { id: 'classic', name: 'Классический', family: '"Segoe UI", system-ui, sans-serif', lh: 1.4, ls: '0' },
  { id: 'oswald', name: 'Oswald', family: '"Oswald", "Segoe UI", sans-serif', lh: 1.4, ls: '0' },
  { id: 'cormorant', name: 'Cormorant', family: '"Cormorant", Georgia, serif', lh: 1.4, ls: '0' },
  { id: 'comfortaa', name: 'Comfortaa', family: '"Comfortaa", "Segoe UI", sans-serif', lh: 1.45, ls: '0' },
  { id: 'rubik', name: 'Rubik', family: '"Rubik", "Segoe UI", sans-serif', lh: 1.4, ls: '0' },
  { id: 'manrope', name: 'Manrope', family: '"Manrope", "Segoe UI", sans-serif', lh: 1.45, ls: '0' }
]

export function fontFamily(id: FontId): string {
  return FONTS.find((f) => f.id === id)?.family ?? FONTS[0].family
}

export const DEFAULT_UI: UiSettings = {
  accent: '#ffdb4d',
  panelColor: '#16181f',
  panelOpacity: 0.97,
  glass: false,
  glassApp: false,
  glassBlur: 22,
  glassTint: 0.62,
  radius: 22,
  font: 'classic'
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  mode: 'none',
  gradient: 'aurora',
  mediaPath: null,
  blur: 16,
  darken: 0.35,
  gradientDarken: 0.35
}

export const DEFAULT_WEATHER = {
  mode: 'off' as const,
  intensity: 0.6
}

const noHidden: HiddenMap = {
  ads: false,
  podcasts: false,
  subscribe: false,
  social: false,
  recommendations: false,
  vibeFeed: false,
  vibeHero: false,
  vibeNews: false
}

const noSidebar: SidebarMap = {
  sidebarAll: false,
  logo: false,
  search: false,
  wave: false,
  foryou: false,
  concerts: false,
  nonmusic: false,
  kids: false,
  collection: false,
  plus: false,
  pins: false
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  sidebar: { ...noSidebar },
  playerPosition: 'bottom'
}

export const DEFAULT_AUDIO: AudioSettings = {
  eqEnabled: false,
  eqPreset: 'flat',
  eqBands: eqPresetBands('flat'),
  visualizer: 'off',
  visualizerOpacity: 0.5,
  visualizerColor: '#ffdb4d',
  rgbCycle: true,
  shakeEnabled: false,
  shakeStrength: 10,
  rgbMode: 'forward',
  shakeMode: 'circular'
}

function hidden(overrides: Partial<HiddenMap>): HiddenMap {
  return { ...noHidden, ...overrides }
}

function sidebar(overrides: Partial<SidebarMap>): SidebarMap {
  return { ...noSidebar, ...overrides }
}

export const PROFILES: ProfilePreset[] = [
  {
    id: 'minimal',
    name: 'Минимализм',
    description: 'Тёмный графит, без рекламы и лишних категорий слева',
    background: { mode: 'gradient', gradient: 'graphite', mediaPath: null, blur: 0, darken: 0.55, gradientDarken: 0.55 },
    hidden: hidden({ ads: true, podcasts: true, subscribe: true, social: true, recommendations: true }),
    layout: {
      sidebar: sidebar({ concerts: true, nonmusic: true, kids: true, plus: true, pins: true }),
      playerPosition: 'bottom'
    },
    audio: { ...DEFAULT_AUDIO, eqBands: eqPresetBands('flat') },
    ui: { ...DEFAULT_UI }
  },
  {
    id: 'dark',
    name: 'Тёмная тема',
    description: 'Глубокий синий фон, спокойный интерфейс без рекламы',
    background: { mode: 'gradient', gradient: 'midnight', mediaPath: null, blur: 0, darken: 0.4, gradientDarken: 0.4 },
    hidden: hidden({ ads: true, subscribe: true, social: true }),
    layout: { sidebar: sidebar({ plus: true }), playerPosition: 'bottom' },
    audio: { ...DEFAULT_AUDIO, eqBands: eqPresetBands('flat') },
    ui: { ...DEFAULT_UI }
  },
  {
    id: 'custom-bg',
    name: 'Кастомный фон',
    description: 'Аврора на весь экран и визуализатор поверх фона',
    background: { mode: 'gradient', gradient: 'aurora', mediaPath: null, blur: 0, darken: 0.35, gradientDarken: 0.35 },
    hidden: hidden({ ads: true, recommendations: true }),
    layout: { sidebar: sidebar({}), playerPosition: 'bottom' },
    audio: { ...DEFAULT_AUDIO, visualizer: 'bars', eqBands: eqPresetBands('flat') },
    ui: { ...DEFAULT_UI, glass: true, glassApp: true, glassBlur: 22, glassTint: 0.62, panelOpacity: 0.75 }
  }
]

export const DEFAULT_SETTINGS: AppSettings = {
  background: { ...DEFAULT_BACKGROUND },
  weather: { ...DEFAULT_WEATHER },
  hidden: { ...noHidden, ads: true },
  layout: { sidebar: { ...noSidebar }, playerPosition: 'bottom' },
  audio: { ...DEFAULT_AUDIO, eqBands: eqPresetBands('flat') },
  ui: { ...DEFAULT_UI },
  volume: 1,
  hotkey: 'Ctrl+Shift+M',
  yandexGlow: true,
  hideArtist: false,
  hideTrackDescription: false,
  glassAutoDisabled: false,
  mediaHistory: [],
  gearLocked: true,
  showFloatingButton: true,
  activeProfile: 'custom'
}

export function cloneSettings(settings: AppSettings): AppSettings {
  return structuredClone(settings)
}

export function profileSettings(profile: ProfilePreset): AppSettings {
  return {
    background: { ...profile.background },
    weather: { ...DEFAULT_WEATHER },
    hidden: { ...profile.hidden },
    layout: { sidebar: { ...profile.layout.sidebar }, playerPosition: profile.layout.playerPosition },
    audio: { ...profile.audio, eqBands: [...profile.audio.eqBands] },
    ui: { ...profile.ui },
    volume: 1,
    hotkey: 'Ctrl+Shift+M',
    yandexGlow: false,
    hideArtist: false,
    hideTrackDescription: false,
    glassAutoDisabled: false,
  mediaHistory: [],
      gearLocked: true,
    showFloatingButton: true,
    activeProfile: profile.id
  }
}
