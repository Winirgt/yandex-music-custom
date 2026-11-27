import { protocol, session } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

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

/** Отдаёт текущий фон по ymod-media:// с поддержкой Range (для видео). */
export function registerMediaProtocol(getMediaPath: () => string | null): void {
  protocol.handle('ymod-media', (request) => {
    const filePath = getMediaPath()
    if (!filePath || !existsSync(filePath)) return new Response('no media', { status: 404 })
    const mime = MEDIA_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const size = statSync(filePath).size
    const range = request.headers.get('range')
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0
        const end = Math.min(m[2] ? parseInt(m[2], 10) : size - 1, size - 1)
        const chunk = end - start + 1
        const stream = createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: {
            'content-type': mime,
            'content-range': `bytes ${start}-${end}/${size}`,
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

export function relaxCsp(policy: string): string {
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
      } else {
        result += "; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* https:"
      }
      return result
    })
    .join(', ')
}

export function relaxSessionCsp(): void {
  // В официальном приложении страница грузится по кастомному протоколу,
  // поэтому ослабляем CSP для всех ответов сессии, а не только для yandex-хостов.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {}
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() !== 'content-security-policy') continue
      const values = headers[name]
      if (Array.isArray(values)) headers[name] = values.map((v) => relaxCsp(v))
    }
    callback({ responseHeaders: headers })
  })
}
