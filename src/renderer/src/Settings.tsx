import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type {
  AppSettings,
  AudioStatus,
  BackgroundSettings,
  ElementKey,
  EqPresetId,
  RgbMode,
  SettingsPayload,
  ShakeMode,
  SidebarKey,
  UiSettings,
  VisualizerKind
} from '../../shared/types'
import { EQ_FREQUENCIES, EQ_PRESETS, FONTS, GRADIENTS, PROFILES, eqPresetBands, fontFamily, getGradient } from '../../shared/presets'
import { BRAND } from '../../shared/brand'

type TabId = 'profiles' | 'appearance' | 'interface' | 'sound' | 'visualizer' | 'menu'
type SaveStatus = 'idle' | 'saving' | 'saved'

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'profiles', label: 'Профили', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 4.8-9 4.8-9-4.8L12 3Z" /><path d="m3 12.3 9 4.8 9-4.8" /><path d="m3 16.8 9 4.8 9-4.8" /></svg> },
  { id: 'appearance', label: 'Фон', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.5" /><path d="m4 17 4.5-4.5 3.5 3.5 2.5-2.5L20 18" /></svg> },
  { id: 'interface', label: 'Интерфейс', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg> },
  { id: 'sound', label: 'Эквалайзер', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M10 20V4M15 20v-8M20 20V7" /></svg> },
  { id: 'visualizer', label: 'Визуал', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3" /></svg> },
  { id: 'menu', label: 'Меню', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-2 1-2h2a4 4 0 0 0 4-4c0-5-4-10-9-10Z" /><circle cx="8" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16" cy="10" r="1" /></svg> }
]

const HIDE_ITEMS: { key: ElementKey; title: string; hint: string }[] = [
  { key: 'ads', title: 'Реклама и промо-баннеры', hint: 'Промо-блоки и рекламные ссылки' },
  { key: 'podcasts', title: 'Подкасты', hint: 'Пункты меню и блоки с подкастами' },
  { key: 'subscribe', title: 'Купить подписку / Плюс', hint: 'Кнопки подключения подписки' },
  { key: 'social', title: 'Соцкнопки', hint: 'Ссылки на VK, Telegram, OK' },
  { key: 'recommendations', title: 'Рекомендации', hint: 'Блоки «Вам может понравиться» и «Похожие»' },
  { key: 'vibeFeed', title: 'Лента «Моей волны»', hint: 'Список настроений, артистов и релизов' },
  { key: 'vibeHero', title: 'Герой «Моя волна»', hint: 'Заголовок, обложка и кнопки плеера' },
  { key: 'vibeNews', title: 'Анонсы / новости волны', hint: 'Строки-анонсы под плеером' }
]

const SIDEBAR_ITEMS: { key: SidebarKey; title: string }[] = [
  { key: 'sidebarAll', title: 'Сайдбар целиком' },
  { key: 'logo', title: 'Логотип' },
  { key: 'search', title: 'Поиск' },
  { key: 'wave', title: 'Моя волна' },
  { key: 'foryou', title: 'Для вас и Тренды' },
  { key: 'concerts', title: 'Концерты' },
  { key: 'nonmusic', title: 'Книги и подкасты' },
  { key: 'kids', title: 'Детям' },
  { key: 'collection', title: 'Коллекция' },
  { key: 'pins', title: 'Закреплённые плейлисты' }
]

const RGB_MODES: { id: RgbMode; name: string; hint: string }[] = [
  { id: 'forward', name: 'Вперёд', hint: 'Оттенок идёт по спектру вперёд' },
  { id: 'sweep', name: 'Слева направо', hint: 'Цвет бежит по полосам слева направо' },
]

const SHAKE_MODES: { id: ShakeMode; name: string; hint: string }[] = [
  { id: 'circular', name: 'Круговое', hint: 'Движение по кругу' },
  { id: 'horizontal', name: 'Горизонтальное', hint: 'Только влево-вправо' },
  { id: 'vertical', name: 'Вертикальное', hint: 'Только вверх-вниз' }
]

const VISUALIZERS: { id: VisualizerKind; name: string; hint: string }[] = [
  { id: 'off', name: 'Выключен', hint: 'Без визуализации' },
  { id: 'bars', name: 'Спектр', hint: 'Полосы частот, как в Winamp' },
  { id: 'wave', name: 'Волна', hint: 'Осциллограмма сигнала' },
  { id: 'radial', name: 'Круг', hint: 'Лучи по кругу от центра' },
  { id: 'rings', name: 'Кольца', hint: 'Расходящиеся кольца по битам' },
  { id: 'aurora', name: 'Аврора', hint: 'Плавные цветовые пятна' }
]

function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '255, 219, 77'
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

function TitleBar(props: { version: string; onClose: () => void }): ReactNode {
  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 19V5l7 8 7-8v14" /></svg>
        </span>
        <div className="brand-text">
          <h1>{BRAND.name}</h1>
          <p>{BRAND.tagline} · v{props.version || '—'}</p>
        </div>
      </div>
      <button className="icon-button close-button" type="button" onClick={props.onClose} aria-label="Закрыть настройки">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </header>
  )
}

function Switch(props: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={props.checked} disabled={props.disabled}
      className={`switch${props.checked ? ' is-on' : ''}`} onClick={() => props.onChange(!props.checked)}>
      <span className="switch-knob" />
    </button>
  )
}

function ToggleRow(props: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }): ReactNode {
  return (
    <div className="toggle-row">
      <div className="toggle-row-text">
        <span className="toggle-title">{props.title}</span>
        {props.hint && <span className="toggle-hint">{props.hint}</span>}
      </div>
      <Switch checked={props.checked} onChange={props.onChange} />
    </div>
  )
}

function RangeField(props: {
  label: string; value: number; min: number; max: number; step: number; suffix: string
  disabled?: boolean; hint?: string; onChange: (v: number) => void
}): ReactNode {
  const percent = ((props.value - props.min) / (props.max - props.min)) * 100
  return (
    <label className={`range-field${props.disabled ? ' is-disabled' : ''}`}>
      <span className="range-head">
        <span>{props.label}</span>
        <span className="range-value">{Math.round(props.value)}{props.suffix}</span>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        disabled={props.disabled} style={{ '--range-fill': `${percent}%` } as CSSProperties}
        onChange={(e) => props.onChange(Number(e.target.value))} />
      {props.hint && <span className="range-hint">{props.hint}</span>}
    </label>
  )
}

export default function Settings(): ReactNode {
  const [payload, setPayload] = useState<SettingsPayload | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [tab, setTab] = useState<TabId>('profiles')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [closing, setClosing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [audioStatus, setAudioStatus] = useState<AudioStatus>({ attached: false, reason: 'idle' })
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [rgbMenuOpen, setRgbMenuOpen] = useState(false)
  const [shakeMenuOpen, setShakeMenuOpen] = useState(false)
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'gif' | 'image'>('all')

  const settingsRef = useRef<AppSettings | null>(null)
  const saveTimer = useRef<number | null>(null)
  const closingRef = useRef(false)

  const applySettings = useCallback((next: AppSettings) => {
    settingsRef.current = next
    setSettings(next)
  }, [])

  const saveNow = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const current = settingsRef.current
    if (!current) return
    setStatus('saving')
    try {
      const result = await window.ymSettings.update({
        background: current.background,
        weather: current.weather,
        hidden: current.hidden,
        layout: current.layout,
        audio: current.audio,
        ui: current.ui,
        volume: current.volume,
        hotkey: current.hotkey,
        yandexGlow: current.yandexGlow,
        hideArtist: current.hideArtist,
        hideTrackDescription: current.hideTrackDescription,
        gearLocked: current.gearLocked,
        showFloatingButton: current.showFloatingButton
      })
      if (result) {
        setPayload(result)
        applySettings(result.settings)
      }
      setStatus('saved')
    } catch (error) {
      console.error('[settings] save error', error)
      setStatus('idle')
    }
  }, [])

  const scheduleSave = useCallback(() => {
    // Сохраняем сразу, без debounce: настройка не должна теряться при закрытии.
    void saveNow()
  }, [saveNow])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    void saveNow()
    setClosing(true)
    window.setTimeout(() => window.ymSettings.close(), 190)
  }, [saveNow])

  useEffect(() => {
    let alive = true
    window.ymSettings.getSettings().then((result) => {
      if (!alive) return
      setPayload(result)
      applySettings(result.settings)
    }).catch((e) => console.error('[settings] load error', e))
    window.ymSettings.onRequestClose(() => requestClose())
    window.ymSettings.onAudioStatus((s) => setAudioStatus(s))
    return () => {
      alive = false
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    }
  }, [applySettings, requestClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  useEffect(() => {
    if (status !== 'saved') return
    const t = window.setTimeout(() => setStatus('idle'), 1600)
    return () => window.clearTimeout(t)
  }, [status])

  useEffect(() => {
    if (tab !== 'sound') return
    const t = window.setInterval(() => {
      void window.ymSettings.getAudioStatus().then(setAudioStatus)
    }, 2000)
    return () => window.clearInterval(t)
  }, [tab])

  // Применяем кастомизацию меню живьём через CSS-переменные.
  useEffect(() => {
    if (!settings) return
    const ui = settings.ui
    const root = document.documentElement
    root.style.setProperty('--accent', ui.accent)
    root.style.setProperty('--accent-rgb', hexToRgb(ui.accent))
    root.style.setProperty('--panel-rgb', hexToRgb(ui.panelColor))
    root.style.setProperty('--panel-alpha', String(ui.panelOpacity))
    root.style.setProperty('--radius', `${ui.radius}px`)
    root.style.setProperty('--glass-blur', '0px')
    root.style.setProperty('--font-family', fontFamily(ui.font))
    const fontDef = FONTS.find((f) => f.id === ui.font) ?? FONTS[0]
    root.style.setProperty('--font-lh', String(fontDef.lh))
    root.style.setProperty('--font-ls', fontDef.ls)
  }, [settings])

  useEffect(() => {
    if (!recordingHotkey) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingHotkey(false)
        return
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
      parts.push(key)
      const current = settingsRef.current
      if (current) commit({ ...current, hotkey: parts.join('+') })
      setRecordingHotkey(false)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [recordingHotkey])

  const commit = (next: AppSettings): void => {
    const normalized: AppSettings = { ...next, activeProfile: 'custom' }
    settingsRef.current = normalized
    setSettings(normalized)
    scheduleSave()
  }

  const updateBackground = (patch: Partial<BackgroundSettings>): void => {
    const c = settingsRef.current
    if (!c) return
    commit({ ...c, background: { ...c.background, ...patch } })
  }
  const updateWeather = (patch: Partial<AppSettings['weather']>): void => {
    const c = settingsRef.current
    if (!c) return
    commit({ ...c, weather: { ...c.weather, ...patch } })
  }
  const updateHidden = (key: ElementKey, value: boolean): void => {
    const c = settingsRef.current
    if (!c) return
    commit({ ...c, hidden: { ...c.hidden, [key]: value } })
  }
  const updateSidebar = (key: SidebarKey, value: boolean): void => {
    const c = settingsRef.current
    if (!c) return
    commit({ ...c, layout: { ...c.layout, sidebar: { ...c.layout.sidebar, [key]: value } } })
  }
  const updateAudio = (patch: Partial<AppSettings['audio']>): void => {
    const c = settingsRef.current
    if (!c) return
    commit({ ...c, audio: { ...c.audio, ...patch } })
  }
  const updateUi = (patch: Partial<UiSettings>): void => {
    const c = settingsRef.current
    if (!c) return
    commit({ ...c, ui: { ...c.ui, ...patch } })
  }

  const chooseMedia = async (): Promise<void> => {
    await saveNow()
    setMediaLoading(true)
    try {
      const result = await window.ymSettings.chooseMedia()
      if (!result) return
      setPayload(result)
      applySettings(result.settings)
      setStatus('saved')
    } finally {
      setMediaLoading(false)
    }
  }
  const selectHistory = async (path: string): Promise<void> => {
    setMediaLoading(true)
    try {
      const result = await window.ymSettings.selectMediaPath(path)
      if (!result) return
      setPayload(result)
      applySettings(result.settings)
      setStatus('saved')
    } finally {
      setMediaLoading(false)
    }
  }
  const removeMedia = async (): Promise<void> => {
    await saveNow()
    const result = await window.ymSettings.clearMedia()
    setPayload(result)
    applySettings(result.settings)
    setStatus('saved')
  }
  const applyProfile = async (id: string): Promise<void> => {
    const result = await window.ymSettings.applyProfile(id)
    setPayload(result)
    applySettings(result.settings)
    setStatus('saved')
  }
  const resetAll = async (): Promise<void> => {
    const result = await window.ymSettings.resetAll()
    setPayload(result)
    applySettings(result.settings)
    setStatus('saved')
    setConfirmReset(false)
    setTab('profiles')
  }

  if (!settings) {
    return (
      <div className="shell shell-loading">
        <TitleBar version={payload?.appVersion ?? ''} onClose={requestClose} />
        <div className="loading-state"><span className="spinner" /><span>Загружаем настройки…</span></div>
      </div>
    )
  }

  const background = settings.background
  const hasMedia = Boolean(background.mediaPath)
  const kind = payload?.backgroundKind ?? null
  const mediaUrl = payload?.backgroundUrl ?? null
  const previewGradient = getGradient(background.gradient).css

  const audioStatusText =
    audioStatus.reason === 'ok' ? 'Эквалайзер подключён к звуку'
      : audioStatus.reason === 'no-audio' ? 'Ждём трек: включите музыку'
        : audioStatus.reason === 'cors' ? 'Недоступно: CDN без CORS (звук не трогаем)'
          : audioStatus.reason === 'error' ? 'Ошибка подключения Web Audio'
            : 'Эквалайзер выключен'

  return (
    <div className={`shell${closing ? ' is-closing' : ''}`}>
      <TitleBar version={payload?.appVersion ?? ''} onClose={requestClose} />

      <nav className="tabs" aria-label="Разделы настроек">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={`tab${tab === item.id ? ' is-active' : ''}`} onClick={() => setTab(item.id)}>
            <span className="tab-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="content">
        <div className="panel" key={tab}>
          {tab === 'profiles' && (
            <>
              <div className="section-head">
                <h2>Профили настроек</h2>
                <p>Готовые комбинации фона, интерфейса и звука. Применяются в один клик.</p>
              </div>
              <div className="profile-grid">
                {PROFILES.map((profile) => {
                  const active = settings.activeProfile === profile.id
                  return (
                    <button key={profile.id} type="button" className={`profile-card${active ? ' is-active' : ''}`} onClick={() => void applyProfile(profile.id)}>
                      <span className="profile-preview" style={{ backgroundImage: getGradient(profile.background.gradient).css }}>
                        <span className="profile-preview-ui" />
                      </span>
                      <span className="profile-info">
                        <span className="profile-name">{profile.name}</span>
                        <span className="profile-description">{profile.description}</span>
                        <span className="profile-apply">{active ? 'Активен' : 'Применить'}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className={`custom-profile-note${settings.activeProfile === 'custom' ? ' is-active' : ''}`}>
                <span className="custom-profile-dot" />
                <div>
                  <strong>Свой профиль</strong>
                  <p>Любое изменение создаёт собственный профиль и сохраняется автоматически.</p>
                </div>
              </div>
              <div className="danger-zone">
                <div>
                  <strong>Сбросить всё</strong>
                  <p>Вернуть фон, интерфейс, эквалайзер и визуализатор к значениям по умолчанию.</p>
                </div>
                {confirmReset ? (
                  <div className="confirm-actions">
                    <button type="button" className="btn danger" onClick={() => void resetAll()}>Да, сбросить</button>
                    <button type="button" className="btn ghost" onClick={() => setConfirmReset(false)}>Отмена</button>
                  </div>
                ) : (
                  <button type="button" className="btn ghost danger-text" onClick={() => setConfirmReset(true)}>Сбросить</button>
                )}
              </div>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <div className="section-head">
                <h2>Фон приложения</h2>
                <p>Градиент, фото, GIF или видео с размытием и затемнением.</p>
              </div>

              <div className="bg-preview">
                {background.mode === 'media' && kind === 'video' && mediaUrl ? (
                  <video className="bg-preview-image" src={mediaUrl} muted loop autoPlay playsInline
                    style={{ filter: `blur(${Math.min(background.blur, 16)}px)`, transform: 'scale(1.16)' }} />
                ) : (
                  <div className="bg-preview-image"
                    style={{
                      backgroundImage: background.mode === 'media' && mediaUrl ? `url("${mediaUrl}")` : previewGradient,
                      filter: background.mode === 'media' ? `blur(${Math.min(background.blur, 16)}px)` : 'none',
                      transform: `scale(${background.mode === 'media' ? 1.16 : 1.08})`
                    }} />
                )}
                <div className="bg-preview-darken" style={{ background: `rgba(0,0,0,${background.mode === 'none' ? 0.85 : background.darken})` }} />
                <div className="bg-preview-content">
                  <span className="mock-title" /><span className="mock-line" /><span className="mock-line short" />
                </div>
                <span className="bg-preview-label">
                  {background.mode === 'none' ? 'Фон отключён'
                    : background.mode === 'media' ? (kind === 'video' ? 'Видео' : kind === 'gif' ? 'GIF' : 'Изображение')
                      : `Градиент · ${getGradient(background.gradient).name}`}
                </span>
              </div>

              <div className="segmented" role="group" aria-label="Режим фона">
                <button type="button" className={background.mode === 'none' ? 'is-active' : ''} onClick={() => updateBackground({ mode: 'none' })}>Без фона</button>
                <button type="button" className={background.mode === 'gradient' ? 'is-active' : ''} onClick={() => updateBackground({ mode: 'gradient' })}>Градиент</button>
                <button type="button" className={background.mode === 'media' ? 'is-active' : ''}
                  onClick={() => { if (hasMedia) updateBackground({ mode: 'media' }); else void chooseMedia() }}>Фото / GIF / видео</button>
              </div>

              {background.mode === 'none' && (
                <div className="card">
                  <div className="card-head"><h3>Стекло</h3></div>
                  <ToggleRow title="Стекло всего приложения" hint="Прозрачность и размытие без фона"
                    checked={settings.ui.glassApp}
                    onChange={(v) => {
                      const c = settingsRef.current
                      if (c) commit({ ...c, ui: { ...c.ui, glassApp: v }, background: { ...c.background, mode: 'none' } })
                    }} />
                </div>
              )}

              {background.mode === 'gradient' && (
                <div className="card">
                  <div className="card-head"><h3>Готовые градиенты</h3><span>6 вариантов</span></div>
                  <div className="gradient-grid">
                    {GRADIENTS.map((g) => {
                      const selected = background.gradient === g.id
                      return (
                        <button key={g.id} type="button" className={`gradient-card${selected ? ' is-selected' : ''}`}
                          style={{ backgroundImage: g.css }} onClick={() => updateBackground({ mode: 'gradient', gradient: g.id })}>
                          <span className="gradient-name">{g.name}</span>
                          <span className="gradient-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="range-group">
                    <RangeField label="Затемнение градиента" value={Math.round(background.gradientDarken * 100)} min={0} max={85} step={1} suffix=" %"
                      onChange={(v) => updateBackground({ gradientDarken: v / 100 })} />
                  </div>
                </div>
              )}

              {background.mode === 'media' && (
                <>
                  <div className="card">
                    <div className="card-head"><h3>Своё медиа</h3><span>{hasMedia ? (kind === 'video' ? 'Видео загружено' : kind === 'gif' ? 'GIF загружен' : 'Изображение загружено') : 'JPG, PNG, WebP, GIF, MP4, WebM'}</span></div>
                    <div className="image-zone">
                      <div className="image-thumb" style={hasMedia && payload?.mediaPreviewData ? { backgroundImage: `url("${payload.mediaPreviewData}")` } : undefined}>
                        {hasMedia && payload?.mediaPreviewData && kind === 'gif' ? (
                          <img src={payload.mediaPreviewData} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : !hasMedia ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.5" /><path d="m4 17 4.5-4.5 3.5 3.5 2.5-2.5L20 18" /></svg>
                        ) : null}
                      </div>
                      <div className="image-actions">
                        <button type="button" className="btn primary" onClick={() => void chooseMedia()}>{hasMedia ? 'Заменить медиа' : 'Загрузить медиа'}</button>
                        {hasMedia && <button type="button" className="btn ghost" onClick={() => void removeMedia()}>Убрать</button>}
                      </div>
                    </div>
                    <div className="range-group">
                      <RangeField label="Размытие" value={background.blur} min={0} max={32} step={1} suffix=" px"
                        disabled={!hasMedia} onChange={(v) => updateBackground({ blur: v })} />
                      <RangeField label="Затемнение" value={Math.round(background.darken * 100)} min={0} max={85} step={1} suffix=" %"
                        disabled={!hasMedia} onChange={(v) => updateBackground({ darken: v / 100 })} />
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-head"><h3>История обоев</h3></div>
                    <div className="segmented five" role="group" aria-label="Категория обоев">
                      {([
                        ['all', 'Все'], ['video', 'Видео'], ['gif', 'GIF'], ['image', 'Фото']
                      ] as const).map(([id, label]) => (
                        <button key={id} type="button" className={mediaFilter === id ? 'is-active' : ''}
                          onClick={() => setMediaFilter(id)}>{label}</button>
                      ))}
                    </div>
                    <div className="history-grid">
                      {(payload?.mediaHistoryPreviews ?? [])
                        .filter((item) => mediaFilter === 'all' || item.kind === mediaFilter)
                        .map((item) => (
                          <button key={item.path} type="button" className={`history-card${background.mediaPath === item.path ? ' is-active' : ''}`}
                            title={item.path} onClick={() => void selectHistory(item.path)}>
                            {item.data ? (
                              item.kind === 'gif'
                                ? <img src={item.data} alt="" />
                                : <span style={{ backgroundImage: `url("${item.data}")` }} />
                            ) : null}
                            <small>{item.kind === 'video' ? 'Видео' : item.kind === 'gif' ? 'GIF' : 'Фото'}</small>
                          </button>
                        ))}
                      {(payload?.mediaHistoryPreviews ?? []).length === 0 && (
                        <span className="history-empty">Пока пусто — загрузи обои выше</span>
                      )}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-head"><h3>Шейк фона</h3></div>
                    <ToggleRow title="Двигать фон под бит" hint="Фото/GIF/видео слегка двигается в такт музыке"
                      checked={settings.audio.shakeEnabled} onChange={(v) => updateAudio({ shakeEnabled: v })} />
                    <RangeField label="Сила шейка" value={settings.audio.shakeStrength} min={0} max={24} step={1} suffix=" px"
                      disabled={!settings.audio.shakeEnabled}
                      onChange={(v) => updateAudio({ shakeStrength: v })} />
                    <button type="button" className={`submenu-trigger${shakeMenuOpen ? ' is-open' : ''}`}
                      onClick={() => setShakeMenuOpen((v) => !v)} aria-expanded={shakeMenuOpen}>
                      <span>Направление шейка</span>
                      <span className="submenu-current">{SHAKE_MODES.find((m) => m.id === settings.audio.shakeMode)?.name}</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {shakeMenuOpen && (
                      <div className="submenu-panel">
                        {SHAKE_MODES.map((m) => (
                          <button key={m.id} type="button"
                            className={`submenu-item${settings.audio.shakeMode === m.id ? ' is-active' : ''}`}
                            onClick={() => updateAudio({ shakeMode: m.id })}>
                            <span>{m.name}</span><small>{m.hint}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'interface' && (
            <>
              <div className="section-head">
                <h2>Интерфейс</h2>
                <p>Скрытие элементов через CSS + MutationObserver, категории слева и позиция плеера.</p>
              </div>

              <div className="card toggle-list">
                <div className="card-head"><h3>Лишние элементы</h3></div>
                {HIDE_ITEMS.map((item) => (
                  <ToggleRow key={item.key} title={item.title} hint={item.hint} checked={settings.hidden[item.key]} onChange={(v) => updateHidden(item.key, v)} />
                ))}
              </div>

              <div className="card toggle-list">
                <div className="card-head"><h3>Категории слева</h3></div>
                {SIDEBAR_ITEMS.map((item) => (
                  <ToggleRow key={item.key} title={item.title} checked={settings.layout.sidebar[item.key]} onChange={(v) => updateSidebar(item.key, v)} />
                ))}
              </div>

              <div className="card">
                <ToggleRow title="Плавающая кнопка настроек" hint="Шестерёнка в правом нижнем углу; повторное нажатие закрывает меню"
                  checked={settings.showFloatingButton}
                  onChange={(v) => { const c = settingsRef.current; if (c) commit({ ...c, showFloatingButton: v }) }} />
                <ToggleRow title="Светяшка «Моей волны»" hint="Анимированный фон и подсветка Яндекса на главной странице"
                  checked={settings.yandexGlow}
                  onChange={(v) => { const c = settingsRef.current; if (c) commit({ ...c, yandexGlow: v }) }} />
                <ToggleRow title="Скрыть исполнителя с песни" hint="Убирает фото/имя артиста в блоке «Моя волна»"
                  checked={settings.hideArtist}
                  onChange={(v) => { const c = settingsRef.current; if (c) commit({ ...c, hideArtist: v }) }} />
                <ToggleRow title="Скрыть описание трека" hint="Убирает текст про трек под названием песни"
                  checked={settings.hideTrackDescription}
                  onChange={(v) => { const c = settingsRef.current; if (c) commit({ ...c, hideTrackDescription: v }) }} />
              </div>
            </>
          )}

          {tab === 'sound' && (
            <>
              <div className="section-head">
                <h2>Эквалайзер</h2>
                <p>10 полос на Web Audio API. Пресеты или ручная настройка.</p>
              </div>

              <div className="card">
                <ToggleRow title="Включить эквалайзер" hint={audioStatusText} checked={settings.audio.eqEnabled}
                  onChange={(v) => updateAudio({ eqEnabled: v })} />
                <button type="button" className="btn ghost reattach-btn" onClick={() => window.ymSettings.reattachAudio()}>
                  Переподключить звук
                </button>
              </div>

              <div className="card">
                <div className="card-head"><h3>Пресеты</h3></div>
                <div className="chip-grid">
                  {EQ_PRESETS.map((p) => (
                    <button key={p.id} type="button" className={`chip${settings.audio.eqPreset === p.id ? ' is-active' : ''}`}
                      onClick={() => updateAudio({ eqPreset: p.id as EqPresetId, eqBands: eqPresetBands(p.id), eqEnabled: true })}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Полосы</h3><span>{settings.audio.eqPreset === 'custom' ? 'свои значения' : 'пресет'}</span></div>
                <div className="eq-grid">
                  {EQ_FREQUENCIES.map((freq, i) => (
                    <RangeField key={freq} label={freq >= 1000 ? `${freq / 1000}k` : `${freq}`}
                      value={settings.audio.eqBands[i] ?? 0} min={-12} max={12} step={1} suffix=" dB"
                      disabled={!settings.audio.eqEnabled}
                      onChange={(v) => {
                        const bands = [...settings.audio.eqBands]
                        bands[i] = v
                        updateAudio({ eqBands: bands, eqPreset: 'custom' })
                      }} />
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'visualizer' && (
            <>
              <div className="section-head">
                <h2>Визуализатор</h2>
                <p>Реагирует на музыку через анализатор частот; без трека рисует процедурную анимацию.</p>
              </div>

              <div className="card">
                <div className="card-head"><h3>Тип</h3></div>
                <div className="viz-grid">
                  {VISUALIZERS.map((v) => (
                    <button key={v.id} type="button" className={`viz-card${settings.audio.visualizer === v.id ? ' is-active' : ''}`}
                      onClick={() => updateAudio({ visualizer: v.id })}>
                      <span className="viz-name">{v.name}</span>
                      <span className="viz-hint">{v.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Оформление</h3></div>
                <RangeField label="Прозрачность" value={Math.round(settings.audio.visualizerOpacity * 100)} min={5} max={100} step={1} suffix=" %"
                  disabled={settings.audio.visualizer === 'off'} onChange={(v) => updateAudio({ visualizerOpacity: v / 100 })} />
                <ToggleRow title="RGB переливание" hint="Цвет визуализатора плавно переливается по спектру"
                  checked={settings.audio.rgbCycle} onChange={(v) => updateAudio({ rgbCycle: v })} />
                <button type="button" className={`submenu-trigger${rgbMenuOpen ? ' is-open' : ''}`}
                  onClick={() => setRgbMenuOpen((v) => !v)} aria-expanded={rgbMenuOpen}>
                  <span>Поведение RGB</span>
                  <span className="submenu-current">{RGB_MODES.find((m) => m.id === settings.audio.rgbMode)?.name}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {rgbMenuOpen && (
                  <div className="submenu-panel">
                    {RGB_MODES.map((m) => (
                      <button key={m.id} type="button"
                        className={`submenu-item${settings.audio.rgbMode === m.id ? ' is-active' : ''}`}
                        onClick={() => updateAudio({ rgbMode: m.id })}>
                        <span>{m.name}</span><small>{m.hint}</small>
                      </button>
                    ))}
                  </div>
                )}
                <label className="color-field">
                  <span>Цвет</span>
                  <input type="color" value={settings.audio.visualizerColor} disabled={settings.audio.visualizer === 'off'}
                    onChange={(e) => updateAudio({ visualizerColor: e.target.value })} />
                </label>
              </div>

              <div className="card">
                <div className="card-head"><h3>Погода на экране</h3></div>
                <div className="segmented" role="group" aria-label="Погода">
                  <button type="button" className={settings.weather.mode === 'off' ? 'is-active' : ''}
                    onClick={() => updateWeather({ mode: 'off' })}>Выкл</button>
                  <button type="button" className={settings.weather.mode === 'rain' ? 'is-active' : ''}
                    onClick={() => updateWeather({ mode: 'rain' })}>Дождь</button>
                  <button type="button" className={settings.weather.mode === 'snow' ? 'is-active' : ''}
                    onClick={() => updateWeather({ mode: 'snow' })}>Снег</button>
                </div>
                <RangeField label="Интенсивность" value={settings.weather.intensity} min={0.2} max={1} step={0.05} suffix=""
                  disabled={settings.weather.mode === 'off'}
                  onChange={(v) => updateWeather({ intensity: v })} />
              </div>
            </>
          )}
          {tab === 'menu' && (
            <>
              <div className="section-head">
                <h2>Оформление меню</h2>
                <p>Цвет, стекло, скругления и шрифт самого окна настроек.</p>
              </div>

              <div className="card">
                <div className="card-head"><h3>Открытие меню</h3></div>
                <div className="hotkey-row">
                  <span>Горячая клавиша</span>
                  <button type="button" className={`hotkey-capture${recordingHotkey ? ' is-recording' : ''}`}
                    onClick={() => setRecordingHotkey(true)}>
                    {recordingHotkey ? 'Нажми клавиши…' : settings.hotkey}
                  </button>
                </div>
                <RangeField label="Непрозрачность меню" value={Math.round(settings.ui.panelOpacity * 100)} min={15} max={100} step={1} suffix=" %"
                  onChange={(v) => updateUi({ panelOpacity: v / 100 })} />
                <ToggleRow title="Закрепить шестерёнку" hint="Включено — на месте; выключено — перетаскивается"
                  checked={settings.gearLocked}
                  onChange={(v) => { const c = settingsRef.current; if (c) commit({ ...c, gearLocked: v }) }} />
              </div>

              <div className="card">
                <div className="card-head"><h3>Цвета</h3></div>
                <label className="color-row">
                  <span>Акцент</span>
                  <input type="color" value={settings.ui.accent} onChange={(e) => updateUi({ accent: e.target.value })} />
                </label>
                <label className="color-row">
                  <span>Цвет панели</span>
                  <input type="color" value={settings.ui.panelColor} onChange={(e) => updateUi({ panelColor: e.target.value })} />
                </label>
                <RangeField label="Скругление углов" value={settings.ui.radius} min={0} max={32} step={1} suffix=" px"
                  onChange={(v) => updateUi({ radius: v })} />
              </div>

              <div className="card">
                <div className="card-head"><h3>Шрифт</h3></div>
                <div className="font-grid">
                  {FONTS.map((f) => (
                    <button key={f.id} type="button" className={`font-card${settings.ui.font === f.id ? ' is-active' : ''}`}
                      style={{ fontFamily: f.family }} onClick={() => updateUi({ font: f.id })}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {mediaLoading && (
        <div className="media-loading" role="status" aria-live="polite">
          <span className="media-spinner" />
          <strong>Ставим обои…</strong>
          <span>Подожди, файл загружается и подготавливается</span>
        </div>
      )}

      <footer className="footer">
        <span className={`save-status ${status}`}>
          <span className="save-dot" />
          {status === 'saving' ? 'Сохранение…' : status === 'saved' ? 'Сохранено' : 'Изменения сохраняются автоматически'}
        </span>
        <span className="footer-hint">Esc — закрыть</span>
      </footer>
    </div>
  )
}
