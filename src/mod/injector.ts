import { startInjector, type Transport } from '../preload/core'

/**
 * Инжектор для ОФИЦИАЛЬНОГО приложения Яндекс Музыки.
 * Внедряется через webContents.executeJavaScript; связь с main — HTTP + SSE
 * на 127.0.0.1 (порт и токен передаются в window.__YMOD_CFG__).
 * Loopback разрешён из https-страницы (исключение mixed-content для localhost).
 */
declare global {
  interface Window {
    __YMOD_CFG__?: { port: number; token: string }
    __YMOD_STARTED__?: boolean
  }
}

function boot(): void {
  if (window.__YMOD_STARTED__) return
  const cfg = window.__YMOD_CFG__
  if (!cfg || !cfg.port) return
  window.__YMOD_STARTED__ = true

  const base = `http://127.0.0.1:${cfg.port}`
  const query = `?token=${cfg.token}`
  const listeners = new Map<string, ((data: never) => void)[]>()

  const source = new EventSource(`${base}/events${query}`)
  source.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as { type: string; channel?: string; data?: unknown }
      if (msg.type === 'event' && msg.channel) {
        for (const cb of listeners.get(msg.channel) ?? []) cb(msg.data as never)
      }
    } catch {
      // ignore
    }
  }

  const post = (body: unknown): Promise<Response> =>
    fetch(`${base}/msg${query}`, {
      method: 'POST',
      // text/plain = «простой» запрос без CORS-preflight.
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body)
    })

  const transport: Transport = {
    send: (channel, data) => {
      void post({ type: 'send', channel, data }).catch(() => undefined)
    },
    invoke: <T>(channel: string, data?: unknown) =>
      post({ type: 'invoke', id: 1, channel, data })
        .then((r) => r.json())
        .then((msg: { data?: unknown }) => msg.data as T),
    on: (channel, callback) => {
      const list = listeners.get(channel) ?? []
      list.push(callback)
      listeners.set(channel, list)
    }
  }

  startInjector(transport)
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
