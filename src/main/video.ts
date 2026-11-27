import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v'])
const READY_SUFFIX = '-ready.mp4'

function ffmpegPath(): string | null {
  let fromMarker = ''
  try {
    const marker = join(process.resourcesPath ?? '', 'ymod-installed.json')
    if (existsSync(marker)) fromMarker = String(JSON.parse(readFileSync(marker, 'utf8')).ffmpeg ?? '')
  } catch { /* ignore */ }
  const candidates = [
    fromMarker,
    join(process.resourcesPath ?? '', 'ymod-ffmpeg.exe'),
    join(process.resourcesPath ?? '', 'ffmpeg.exe'),
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  ]
  return candidates.find((p) => p && existsSync(p)) ?? null
}

/** Быстрый probe через ffmpeg: не декодирует, только читает заголовок. */
function isAlreadyCompatible(input: string, ffmpeg: string): boolean {
  try {
    const r = spawnSync(ffmpeg, ['-hide_banner', '-i', input], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
    const info = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
    if (!/Video:\s*h264/i.test(info)) return false
    const m = /(\d{3,4})x(\d{3,4})/.exec(info)
    if (!m) return false
    const w = Number(m[1]), h = Number(m[2])
    return w <= 1920 && h <= 1080 && !/yuv420p10le|hevc|av1/i.test(info)
  } catch {
    return false
  }
}

/**
 * Перекодирует только неподходящие видео. Совместимые не трогаем — так качество
 * исходника не теряется. Перекодирование асинхронное, чтобы не блокировать Electron.
 */
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.gif': 'image/gif'
}

function toDataUrl(filePath: string, mime: string): string {
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
}

/** Превью для окна настроек: GIF/картинка — исходник, видео — кадр через ffmpeg. */
export function getMediaPreviewData(input: string): string | null {
  if (!input || !existsSync(input)) return null
  const ext = extname(input).toLowerCase()
  if (MIME[ext]) return toDataUrl(input, MIME[ext])
  if (!VIDEO_EXT.has(ext)) return null
  const preview = join(dirname(input), `${basename(input, ext)}-preview.jpg`)
  if (!existsSync(preview) || statSync(preview).size < 1024) {
    const ffmpeg = ffmpegPath()
    if (!ffmpeg) return null
    try {
      const r = spawnSync(ffmpeg, ['-y', '-ss', '1', '-i', input, '-frames:v', '1', '-vf', 'scale=640:-2', preview], {
        encoding: 'utf8', windowsHide: true, timeout: 30000
      })
      if (r.status !== 0 || !existsSync(preview)) return null
    } catch {
      return null
    }
  }
  return toDataUrl(preview, 'image/jpeg')
}

export function ensureCompatibleVideoAsync(input: string, destDir: string, force = false): Promise<string> {
  if (!input || !VIDEO_EXT.has(extname(input).toLowerCase()) || !existsSync(input)) return Promise.resolve(input)
  if (!force && input.endsWith(READY_SUFFIX)) return Promise.resolve(input)
  const ffmpeg = ffmpegPath()
  if (!ffmpeg) return Promise.resolve(input)
  if (!force && isAlreadyCompatible(input, ffmpeg)) return Promise.resolve(input)

  const output = join(destDir, `background-${Date.now()}${READY_SUFFIX}`)
  const args = [
    '-y', '-i', input,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
    '-an', '-movflags', '+faststart', output
  ]
  return new Promise((resolve) => {
    try {
      const child = spawn(ffmpeg, args, { windowsHide: true, stdio: 'ignore' })
      child.on('error', () => resolve(input))
      child.on('close', (code) => {
        if (code === 0 && existsSync(output) && statSync(output).size > 1024) resolve(output)
        else resolve(input)
      })
    } catch {
      resolve(input)
    }
  })
}
