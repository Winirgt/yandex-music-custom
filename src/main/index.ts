import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  protocol,
  screen,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from 'electron'
import { spawn } from 'node:child_process'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { SettingsStore } from './store'
import { runPatcher } from './patcher'
import { ensureCompatibleVideoAsync, getMediaPreviewData } from './video'
import { BRAND } from '../shared/brand'
import type { AudioStatus, MediaKind, SettingsPayload } from '../shared/types'

const MUSIC_URL = 'https://music.yandex.ru/'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const YANDEX_HOST_RE = /(^|\.)(yandex\.[a-z.]+|ya\.ru|yandex\.team)$/i

/** Official desktop app executable, used to launch it instead of our own window. */
function officialAppExe(): string | null {
  try {
    const local = process.env.LOCALAPPDATA || join(app.getPath('home'), 'AppData', 'Local')
    const dir = join(local, 'Programs', 'YandexMusic')
    const exe = readdirSync(dir).find(
      (f) => f.endsWith('.exe') && statSync(join(dir, f)).size > 100 * 1024 * 1024
    )
    return exe ? join(dir, exe) : null
  } catch {
    return null
  }
}

function launchOfficialApp(): void {
  const exe = officialAppExe()
  if (!exe) return
  try {
    // `cmd /c start` detaches the process properly on Windows, so it survives
    // when the patcher exits right after the installer finishes.
    spawn('cmd', ['/c', 'start', '', `"${exe}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref()
  } catch {
    // If the official app cannot be started, keep the launcher silent.
  }
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])
const GIF_EXT = new Set(['.gif'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v'])
const MAX_MEDIA_BYTES = 200 * 1024 * 1024

const MEDIA_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v'
}

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let store: SettingsStore | null = null
let audioStatus: AudioStatus = { attached: false, reason: 'idle' }

function requireStore(): SettingsStore {
  if (!store) throw new Error('SettingsStore ещё не инициализирован')
  return store
}

function mediaDir(): string {
  return join(app.getPath('userData'), 'backgrounds')
}

function mediaKindOf(path: string | null): MediaKind | null {
  if (!path) return null
  const ext = extname(path).toLowerCase()
  if (GIF_EXT.has(ext)) return 'gif'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (IMAGE_EXT.has(ext)) return 'image'
  return null
}

function buildPayload(): SettingsPayload {
  const settings = requireStore().get()
  const kind = mediaKindOf(settings.background.mediaPath)
  const mediaPath = settings.background.mediaPath
  const version = mediaPath && existsSync(mediaPath) ? statSync(mediaPath).mtimeMs : 0
  return {
    settings,
    backgroundUrl: kind ? `ymod-media://background?v=${version}` : null,
    backgroundKind: kind,
    mediaPreviewData: mediaPath ? getMediaPreviewData(mediaPath) : null,
    mediaHistoryPreviews: settings.mediaHistory
      .filter((p) => existsSync(p))
      .map((p) => ({ path: p, kind: mediaKindOf(p), data: getMediaPreviewData(p) }))
      .filter((item) => item.kind !== null) as Array<{ path: string; kind: 'image' | 'gif' | 'video'; data: string | null }>,
    appVersion: app.getVersion()
  }
}

let activeHotkey = ''

function applyHotkey(accelerator: string): void {
  if (activeHotkey && activeHotkey !== accelerator) {
    try { globalShortcut.unregister(activeHotkey) } catch { /* ignore */ }
  }
  if (activeHotkey === accelerator) return
  try {
    globalShortcut.register(accelerator, () => toggleSettingsWindow())
    activeHotkey = accelerator
  } catch {
    // Клавиша может быть занята.
  }
}

function broadcastSettings(): SettingsPayload {
  const payload = buildPayload()
  applyHotkey(payload.settings.hotkey)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings:changed', payload)
  return payload
}

async function normalizeBackgroundVideo(): Promise<void> {
  const store = requireStore()
  const current = store.get().background.mediaPath
  if (!current || !VIDEO_EXT.has(extname(current).toLowerCase()) || current.endsWith('-ready.mp4')) return
  const dir = mediaDir()
  mkdirSync(dir, { recursive: true })
  const converted = await ensureCompatibleVideoAsync(current, dir)
  if (converted !== current) {
    store.setMedia(converted)
    cleanupMedia(converted)
    broadcastSettings()
  }
}

function isFromSettingsWindow(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return !!settingsWindow && !settingsWindow.isDestroyed() && event.sender === settingsWindow.webContents
}

function isFromMainWindow(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents
}

function cleanupMedia(keepPath: string | null): void {
  const dir = mediaDir()
  if (!existsSync(dir)) return
  for (const fileName of readdirSync(dir)) {
    if (!fileName.startsWith('background-')) continue
    const fullPath = join(dir, fileName)
    if (keepPath && fullPath === keepPath) continue
    try {
      unlinkSync(fullPath)
    } catch {
      // ignore
    }
  }
}

/** Внутренний протокол для фона: отдаёт файл с поддержкой Range (нужно для видео). */
function registerMediaProtocol(): void {
  protocol.handle('ymod-media', (request) => {
    const filePath = requireStore().get().background.mediaPath
    if (!filePath || !existsSync(filePath)) return new Response('no media', { status: 404 })
    const mime = MEDIA_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const size = statSync(filePath).size
    const range = request.headers.get('range')
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0
        const end = m[2] ? parseInt(m[2], 10) : size - 1
        const chunk = Math.min(end, size - 1) - start + 1
        const stream = createReadStream(filePath, { start, end: Math.min(end, size - 1) })
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: {
            'content-type': mime,
            'content-range': `bytes ${start}-${Math.min(end, size - 1)}/${size}`,
            'content-length': String(chunk),
            'accept-ranges': 'bytes'
          }
        })
      }
    }
    const stream = createReadStream(filePath)
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: { 'content-type': mime, 'content-length': String(size), 'accept-ranges': 'bytes' }
    })
  })
}

function relaxCsp(policy: string): string {
  return policy
    .split(',')
    .map((part) => {
      let result = part.trim()
      if (/(^|;)\s*style-src\b/i.test(result)) {
        result = result.replace(/(^|;)(\s*style-src)([^;]*)/i, (_m, s: string, n: string, rest: string) => `${s}${n}${rest} 'unsafe-inline'`)
      }
      if (/(^|;)\s*img-src\b/i.test(result)) {
        result = result.replace(/(^|;)(\s*img-src)([^;]*)/i, (_m, s: string, n: string, rest: string) => `${s}${n}${rest} data: blob: ymod-media:`)
      } else {
        result += "; img-src 'self' data: blob: ymod-media: https:"
      }
      if (/(^|;)\s*media-src\b/i.test(result)) {
        result = result.replace(/(^|;)(\s*media-src)([^;]*)/i, (_m, s: string, n: string, rest: string) => `${s}${n}${rest} data: blob: ymod-media:`)
      } else {
        result += "; media-src 'self' data: blob: ymod-media: https:"
      }
      if (/(^|;)\s*connect-src\b/i.test(result)) {
        result = result.replace(/(^|;)(\s*connect-src)([^;]*)/i, (_m, s: string, n: string, rest: string) => `${s}${n}${rest} ws://127.0.0.1:* http://127.0.0.1:*`)
      }
      return result
    })
    .join(', ')
}

function configureSession(): void {
  const s = session.defaultSession
  s.setUserAgent(CHROME_UA)
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  s.webRequest.onHeadersReceived(
    { urls: ['*://*.yandex.ru/*', '*://*.yandex.com/*', '*://*.yandex.net/*', '*://*.ya.ru/*'] },
    (details, callback) => {
      const headers = details.responseHeaders ?? {}
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() !== 'content-security-policy') continue
        const values = headers[name]
        if (Array.isArray(values)) headers[name] = values.map((v) => relaxCsp(v))
      }
      callback({ responseHeaders: headers })
    }
  )
}

function isYandexUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' && YANDEX_HOST_RE.test(url.hostname)
  } catch {
    return false
  }
}

function openExternalIfNeeded(rawUrl: string): void {
  if (/^https?:/i.test(rawUrl)) void shell.openExternal(rawUrl)
}

function openSettingsWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  const parentBounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(parentBounds).workArea
  const width = Math.min(640, Math.max(500, workArea.width - 80))
  const height = Math.min(840, Math.max(560, workArea.height - 80))
  const x = Math.round(Math.min(Math.max(parentBounds.x + (parentBounds.width - width) / 2, workArea.x + 20), workArea.x + workArea.width - width - 20))
  const y = Math.round(Math.min(Math.max(parentBounds.y + (parentBounds.height - height) / 2, workArea.y + 20), workArea.y + workArea.height - height - 20))

  settingsWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    parent: mainWindow,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    // Не поверх всех окон системы: меню живёт только внутри приложения.
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    title: `${BRAND.name} — настройки`,
    webPreferences: {
      preload: join(__dirname, '../preload/settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void settingsWindow.loadURL(devUrl)
  else void settingsWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function toggleSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
    settingsWindow.webContents.send('settings:request-close')
    return
  }
  openSettingsWindow()
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: BRAND.name,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // Заголовок окна — наш бренд, а не title страницы Яндекса.
  mainWindow.on('page-title-updated', (event) => event.preventDefault())
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy()
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isYandexUrl(url)) return
    event.preventDefault()
    openExternalIfNeeded(url)
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isYandexUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 540,
          height: 720,
          autoHideMenuBar: true,
          backgroundColor: '#0a0a0a',
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
        }
      }
    }
    openExternalIfNeeded(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    const modifier = input.control || input.meta
    if (modifier && input.shift && key === 'm') {
      event.preventDefault()
      toggleSettingsWindow()
      return
    }
    if (key === 'f12') {
      event.preventDefault()
      mainWindow?.webContents.toggleDevTools()
    }
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] Не удалось загрузить ${url}: ${desc} (${code})`)
  })

  void mainWindow.loadURL(MUSIC_URL)
}

function registerIpc(): void {
  ipcMain.handle('settings:get', (event) => {
    if (!isFromMainWindow(event) && !isFromSettingsWindow(event)) throw new Error('Доступ запрещён')
    return buildPayload()
  })

  ipcMain.handle('settings:update', (event, patch) => {
    if (!isFromSettingsWindow(event)) return buildPayload()
    requireStore().update(patch)
    return broadcastSettings()
  })

  ipcMain.handle('settings:choose-media', async (event) => {
    if (!isFromSettingsWindow(event)) return null
    const parent = settingsWindow
    if (!parent) return null
    const options: OpenDialogOptions = {
      title: 'Выберите фон: изображение, GIF или видео',
      properties: ['openFile'],
      filters: [
        { name: 'Изображения и GIF', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
        { name: 'Видео', extensions: ['mp4', 'webm', 'mov', 'm4v'] }
      ]
    }
    const result = await dialog.showOpenDialog(parent, options)
    if (result.canceled || result.filePaths.length === 0) return null
    const sourcePath = result.filePaths[0]
    const ext = extname(sourcePath).toLowerCase()
    if (!IMAGE_EXT.has(ext) && !GIF_EXT.has(ext) && !VIDEO_EXT.has(ext)) {
      dialog.showErrorBox('Неподдерживаемый формат', 'Выберите JPG, PNG, WebP, BMP, GIF, MP4 или WebM.')
      return null
    }
    try {
      if (statSync(sourcePath).size > MAX_MEDIA_BYTES) {
        dialog.showErrorBox('Файл слишком большой', 'Максимальный размер — 200 МБ.')
        return null
      }
      const dir = mediaDir()
      mkdirSync(dir, { recursive: true })
      let destination: string
      if (VIDEO_EXT.has(ext)) {
        destination = await ensureCompatibleVideoAsync(sourcePath, dir, true)
        if (destination === sourcePath) {
          destination = join(dir, `background-${Date.now()}${ext}`)
          copyFileSync(sourcePath, destination)
        }
      } else {
        destination = join(dir, `background-${Date.now()}${ext}`)
        copyFileSync(sourcePath, destination)
      }
      requireStore().setMedia(destination)
      requireStore().addMediaHistory(sourcePath)
      cleanupMedia(destination)
      return broadcastSettings()
    } catch (error) {
      console.error('[main] Не удалось скопировать фон:', error)
      dialog.showErrorBox('Не удалось загрузить фон', String(error))
      return null
    }
  })

  ipcMain.handle('settings:select-media-path', async (event, path: string) => {
    if (!isFromSettingsWindow(event) || !path || !existsSync(path)) return null
    const dir = mediaDir()
    mkdirSync(dir, { recursive: true })
    const prepared = await ensureCompatibleVideoAsync(path, dir)
    requireStore().setMedia(prepared)
    requireStore().addMediaHistory(path)
    return broadcastSettings()
  })

  ipcMain.handle('settings:clear-media', (event) => {
    if (!isFromSettingsWindow(event)) return buildPayload()
    const old = requireStore().get().background.mediaPath
    requireStore().clearMedia()
    cleanupMedia(null)
    if (old) {
      try {
        if (existsSync(old)) unlinkSync(old)
      } catch {
        // ignore
      }
    }
    return broadcastSettings()
  })

  ipcMain.handle('settings:apply-profile', (event, profileId: string) => {
    if (!isFromSettingsWindow(event)) return buildPayload()
    requireStore().applyProfile(String(profileId))
    return broadcastSettings()
  })

  ipcMain.handle('settings:reset', (event) => {
    if (!isFromSettingsWindow(event)) return buildPayload()
    const old = requireStore().get().background.mediaPath
    requireStore().reset()
    cleanupMedia(null)
    if (old) {
      try {
        if (existsSync(old)) unlinkSync(old)
      } catch {
        // ignore
      }
    }
    return broadcastSettings()
  })

  ipcMain.handle('audio:get-status', (event) => {
    if (!isFromSettingsWindow(event)) return audioStatus
    return audioStatus
  })

  ipcMain.on('audio:reattach', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      void mainWindow.webContents.executeJavaScript('window.__YMOD_REATTACH_AUDIO__?.()').catch(() => undefined)
    }
  })

  ipcMain.on('audio:status', (event, status: AudioStatus) => {
    if (!isFromMainWindow(event)) return
    audioStatus = status
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('audio:status', status)
    }
  })

  ipcMain.on('settings:toggle', (event) => {
    if (!isFromMainWindow(event)) return
    toggleSettingsWindow()
  })

  ipcMain.on('settings:open', (event) => {
    if (!isFromMainWindow(event)) return
    openSettingsWindow()
  })

  ipcMain.on('settings:close', (event) => {
    if (!isFromSettingsWindow(event)) return
    settingsWindow?.destroy()
  })
}

// Режим патчера: установка/удаление мода в официальное приложение Яндекс Музыки.
const patchArg = process.argv.includes('--patch') ? 'patch' : process.argv.includes('--unpatch') ? 'unpatch' : null

protocol.registerSchemesAsPrivileged([
  { scheme: 'ymod-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

if (patchArg) {
  app.whenReady().then(async () => {
    const code = await runPatcher(patchArg)
    if (code === 0 && patchArg === 'patch') launchOfficialApp()
    app.exit(code)
  })
} else if (app.isPackaged) {
  // Packaged launcher is only a patch/unpatch tool. Open the official app instead.
  app.whenReady().then(() => {
    launchOfficialApp()
    app.exit(0)
  })
} else {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    })
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
    app.whenReady().then(() => {
      app.setAppUserModelId(BRAND.appId)
      nativeTheme.themeSource = 'dark'
      store = new SettingsStore()
      void normalizeBackgroundVideo()
      configureSession()
      registerMediaProtocol()
      registerIpc()
      applyHotkey(requireStore().get().hotkey)
      createMainWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      })
    })
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
  }
}
