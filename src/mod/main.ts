import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, type OpenDialogOptions } from 'electron'
import http from 'node:http'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { SettingsStore } from '../main/store'
import { registerMediaProtocol } from '../main/media'
import { ensureCompatibleVideoAsync, getMediaPreviewData } from '../main/video'
import type { AudioStatus, SettingsPayload } from '../shared/types'

// Не переопределяем webRequest.onHeadersReceived: официальное приложение ставит
// туда свою проверку сертификатов, и замена ломает загрузку страницы.
// Вместо точечного ослабления CSP отключаем web-security для сессии мода.
app.commandLine.appendSwitch('disable-web-security')

/**
 * Этот модуль внедряется в ОФИЦИАЛЬНОЕ приложение Яндекс Музыки
 * (патчер дописывает require('./ymod/main.js') в его main-бандл).
 * Он не создаёт своё главное окно, а подключается к существующим окнам
 * и внедряет инжектор через executeJavaScript + WebSocket-мост.
 */

// ВАЖНО: не вызываем protocol.registerSchemesAsPrivileged здесь — это сбросило бы
// привилегии кастомного протокола music-application официального приложения.
// ymod-media регистрируем только через protocol.handle (без привилегий).

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])
const GIF_EXT = new Set(['.gif'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v'])

let store: SettingsStore | null = null
let settingsWindow: BrowserWindow | null = null
let audioStatus: AudioStatus = { attached: false, reason: 'idle' }
let injectorSource = ''
let port = 0
const token = randomBytes(16).toString('hex')
const clients = new Set<http.ServerResponse>()

function requireStore(): SettingsStore {
  if (!store) throw new Error('store not ready')
  return store
}

function mediaKindOf(path: string | null): 'image' | 'gif' | 'video' | null {
  if (!path) return null
  const ext = extname(path).toLowerCase()
  if (GIF_EXT.has(ext)) return 'gif'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (IMAGE_EXT.has(ext)) return 'image'
  return null
}

function payload(): SettingsPayload {
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

function pushEvent(channel: string, data: unknown): void {
  const message = `data: ${JSON.stringify({ type: 'event', channel, data })}\n\n`
  for (const client of clients) {
    try {
      client.write(message)
    } catch {
      // ignore
    }
  }
}

let activeHotkey = ''

function applyHotkey(accelerator: string): void {
  if (activeHotkey && activeHotkey !== accelerator) {
    try { globalShortcut.unregister(activeHotkey) } catch { /* ignore */ }
  }
  if (activeHotkey === accelerator) return
  try {
    globalShortcut.register(accelerator, () => toggleSettings())
    activeHotkey = accelerator
  } catch {
    // Клавиша занята системой — оставляем предыдущую.
  }
}

function applyAcrylic(): void {
  for (const win of officialWindows()) {
    try {
      ;(win as BrowserWindow & { setBackgroundMaterial?: (m: string) => void }).setBackgroundMaterial?.('acrylic')
    } catch {
      // Поддерживается не на всех версиях Windows.
    }
  }
}

function broadcast(): SettingsPayload {
  const p = payload()
  pushEvent('settings:changed', p)
  applyHotkey(p.settings.hotkey)
  applyAcrylic()
  return p
}

function officialWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => w !== settingsWindow && !w.isDestroyed())
}

function injectInto(win: BrowserWindow): void {
  const run = (): void => {
    if (win.isDestroyed()) return
    // Never inject the page mod into our own settings window.
    if (win === settingsWindow) return
    const url = win.webContents.getURL()
    if (url.includes('ymod/renderer') || url.includes('out/renderer')) return
    const cfg = JSON.stringify({ port, token })
    void win.webContents
      .executeJavaScript(`window.__YMOD_CFG__=${cfg};\n${injectorSource}`)
      .catch(() => undefined)
  }
  // Патчим Web Audio до выполнения скриптов страницы, иначе Яндекс успеет
  // создать MediaElementSource первым и наш перехват не сработает.
  win.webContents.on('did-start-loading', run)
  win.webContents.on('dom-ready', run)
  win.webContents.on('did-navigate', run)
  if (win.webContents.getURL().startsWith('http')) run()
}

function openSettings(): void {
  const parent = officialWindows()[0]
  if (!parent) return
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  const bounds = parent.getBounds()
  const work = screen.getDisplayMatching(bounds).workArea
  const width = Math.min(640, Math.max(500, work.width - 80))
  const height = Math.min(840, Math.max(560, work.height - 80))
  settingsWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bounds.height - height) / 2),
    parent,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  void settingsWindow.loadFile(join(__dirname, 'renderer', 'index.html'))
}

function toggleSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
    settingsWindow.webContents.send('settings:request-close')
    return
  }
  openSettings()
}

function startBridge(): void {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.searchParams.get('token') !== token) {
      res.writeHead(403)
      res.end()
      return
    }
    res.setHeader('access-control-allow-origin', '*')

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'content-type'
      })
      res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      })
      res.write(':ok\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    if (req.method === 'POST' && url.pathname === '/msg') {
      let body = ''
      req.on('data', (c) => {
        body += c
      })
      req.on('end', () => {
        try {
          const msg = JSON.parse(body) as { type: string; id?: number; channel: string; data?: unknown }
          if (msg.type === 'send') {
            if (msg.channel === 'settings:toggle') toggleSettings()
            if (msg.channel === 'audio:status') {
              audioStatus = msg.data as AudioStatus
              settingsWindow?.webContents.send('audio:status', audioStatus)
            }
            res.writeHead(204)
            res.end()
            return
          }
          if (msg.type === 'invoke' && msg.channel === 'settings:get') {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ type: 'response', id: msg.id, data: payload() }))
            return
          }
          res.writeHead(404)
          res.end()
        } catch {
          res.writeHead(400)
          res.end()
        }
      })
      return
    }

    res.writeHead(404)
    res.end()
  })
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    port = typeof address === 'object' && address ? address.port : 0
  })
}

async function normalizeBackgroundVideo(): Promise<void> {
  const store = requireStore()
  const current = store.get().background.mediaPath
  if (!current || !VIDEO_EXT.has(extname(current).toLowerCase()) || current.endsWith('-ready.mp4')) return
  mkdirSync(mediaDir(), { recursive: true })
  const converted = await ensureCompatibleVideoAsync(current, mediaDir())
  if (converted !== current) {
    store.setMedia(converted)
    cleanupMedia(converted)
    broadcast()
  }
}

function mediaDir(): string {
  return join(app.getPath('userData'), 'backgrounds')
}

function cleanupMedia(keep: string | null): void {
  const dir = mediaDir()
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('background-')) continue
    const full = join(dir, f)
    if (keep && full === keep) continue
    try {
      unlinkSync(full)
    } catch {
      // ignore
    }
  }
}

function registerSettingsIpc(): void {
  const fromSettings = (sender: Electron.WebContents): boolean =>
    !!settingsWindow && sender === settingsWindow.webContents

  ipcMain.handle('settings:get', () => payload())
  ipcMain.handle('settings:update', (event, patch) => {
    if (!fromSettings(event.sender)) return payload()
    requireStore().update(patch)
    return broadcast()
  })
  ipcMain.handle('settings:choose-media', async (event) => {
    if (!fromSettings(event.sender) || !settingsWindow) return null
    const options: OpenDialogOptions = {
      title: 'Выберите фон: изображение, GIF или видео',
      properties: ['openFile'],
      filters: [
        { name: 'Изображения и GIF', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
        { name: 'Видео', extensions: ['mp4', 'webm', 'mov', 'm4v'] }
      ]
    }
    const result = await dialog.showOpenDialog(settingsWindow, options)
    if (result.canceled || result.filePaths.length === 0) return null
    const src = result.filePaths[0]
    const ext = extname(src).toLowerCase()
    if (!IMAGE_EXT.has(ext) && !GIF_EXT.has(ext) && !VIDEO_EXT.has(ext)) return null
    try {
      if (statSync(src).size > 200 * 1024 * 1024) return null
      mkdirSync(mediaDir(), { recursive: true })
      let dest: string
      if (VIDEO_EXT.has(ext)) {
        dest = await ensureCompatibleVideoAsync(src, mediaDir(), true)
        if (dest === src) {
          dest = join(mediaDir(), `background-${Date.now()}${ext}`)
          copyFileSync(src, dest)
        }
      } else {
        dest = join(mediaDir(), `background-${Date.now()}${ext}`)
        copyFileSync(src, dest)
      }
      requireStore().setMedia(dest)
      requireStore().addMediaHistory(src)
      cleanupMedia(dest)
      return broadcast()
    } catch {
      return null
    }
  })
  ipcMain.handle('settings:select-media-path', async (event, path: string) => {
    if (!fromSettings(event.sender) || !path || !existsSync(path)) return null
    mkdirSync(mediaDir(), { recursive: true })
    const prepared = await ensureCompatibleVideoAsync(path, mediaDir())
    requireStore().setMedia(prepared)
    requireStore().addMediaHistory(path)
    return broadcast()
  })

  ipcMain.handle('settings:clear-media', (event) => {
    if (!fromSettings(event.sender)) return payload()
    const old = requireStore().get().background.mediaPath
    requireStore().clearMedia()
    cleanupMedia(null)
    if (old && existsSync(old)) {
      try {
        unlinkSync(old)
      } catch {
        // ignore
      }
    }
    return broadcast()
  })
  ipcMain.handle('settings:apply-profile', (event, id: string) => {
    if (!fromSettings(event.sender)) return payload()
    requireStore().applyProfile(String(id))
    return broadcast()
  })
  ipcMain.handle('settings:reset', (event) => {
    if (!fromSettings(event.sender)) return payload()
    const old = requireStore().get().background.mediaPath
    requireStore().reset()
    cleanupMedia(null)
    if (old && existsSync(old)) {
      try {
        unlinkSync(old)
      } catch {
        // ignore
      }
    }
    return broadcast()
  })
  ipcMain.handle('audio:get-status', () => audioStatus)
  ipcMain.on('audio:reattach', () => {
    for (const win of officialWindows()) {
      void win.webContents.executeJavaScript('window.__YMOD_REATTACH_AUDIO__?.()').catch(() => undefined)
    }
  })
  ipcMain.on('settings:close', (event) => {
    if (fromSettings(event.sender)) settingsWindow?.destroy()
  })
}

app.whenReady().then(() => {
  store = new SettingsStore()
  void normalizeBackgroundVideo()
  injectorSource = readFileSync(join(__dirname, 'injector.js'), 'utf8')
  registerMediaProtocol(() => requireStore().get().background.mediaPath)
  startBridge()
  registerSettingsIpc()
  applyHotkey(requireStore().get().hotkey)
  applyAcrylic()
  for (const win of officialWindows()) injectInto(win)
  app.on('browser-window-created', (_event, win) => injectInto(win))
})
