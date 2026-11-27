// Воркер патчера: запускается в режиме ELECTRON_RUN_AS_NODE (обычный Node, без asar-патчей fs),
// поэтому здесь можно безопасно использовать @electron/asar.
import asar from '@electron/asar'
// Electron patches `fs` for asar even under ELECTRON_RUN_AS_NODE — use original-fs
// so app.asar can be copied byte-for-byte for the backup.
import {
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'original-fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'ascii')
const INTEGRITY_FUSE_INDEX = 4

const mode = process.argv[2] as 'patch' | 'unpatch'
const dir = process.argv[3]
const assets = process.argv[4]

function officialExe(target: string): string | null {
  const exe = readdirSync(target).find(
    (f) => f.endsWith('.exe') && statSync(join(target, f)).size > 100 * 1024 * 1024
  )
  return exe ? join(target, exe) : null
}

function disableIntegrityFuse(exePath: string): void {
  const buf = readFileSync(exePath)
  const idx = buf.indexOf(FUSE_SENTINEL)
  if (idx < 0) return
  const pos = idx + FUSE_SENTINEL.length + 2 + INTEGRITY_FUSE_INDEX
  if (buf[pos] === 49) {
    buf[pos] = 48
    writeFileSync(exePath, buf)
  }
}

async function main(): Promise<number> {
  const asarPath = join(dir, 'resources', 'app.asar')
  const exePath = officialExe(dir)
  if (!exePath || !existsSync(asarPath)) {
    console.error('[patch-worker] не найдены файлы приложения')
    return 1
  }
  const asarBackup = `${asarPath}.ymod-backup`
  const exeBackup = `${exePath}.ymod-backup`
  const marker = join(dir, 'resources', 'ymod-installed.json')

  const ffmpegTarget = join(dir, 'ymod-ffmpeg.exe')
  if (mode === 'unpatch') {
    if (existsSync(asarBackup)) copyFileSync(asarBackup, asarPath)
    if (existsSync(exeBackup)) copyFileSync(exeBackup, exePath)
    if (existsSync(ffmpegTarget)) rmSync(ffmpegTarget, { force: true })
    if (existsSync(marker)) rmSync(marker, { force: true })
    console.log('[patch-worker] мод удалён, оригиналы восстановлены')
    return 0
  }

  if (!existsSync(asarBackup)) copyFileSync(asarPath, asarBackup)
  if (!existsSync(exeBackup)) copyFileSync(exePath, exeBackup)

  const work = join(tmpdir(), `ymod-patch-${Date.now()}`)
  rmSync(work, { recursive: true, force: true })
  asar.extractAll(asarBackup, work)

  const pkg = JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')) as { main: string }
  const entry = join(work, pkg.main)
  let source = readFileSync(entry, 'utf8')

  // Real window transparency: the official app creates an opaque BrowserWindow and
  // later sets an opaque background on theme changes. Make both transparent so the
  // iOS-style glass can actually show the Windows desktop behind it.
  const windowCtor = 'new electron.BrowserWindow({'
  if (source.includes(windowCtor) && !source.includes('transparent: true')) {
    source = source.replace(windowCtor, `${windowCtor}\n    transparent: true,\n    backgroundColor: "#00000000",`)
  }
  source = source.replace(/window\.setBackgroundColor\([^;]*\);/g, 'window.setBackgroundColor("#00000000");')

  if (!source.includes('ymod/main.js')) {
    source += `\n;require('./ymod/main.js');\n`
    writeFileSync(entry, source)
  }

  if (!existsSync(join(assets, 'main.js'))) {
    console.error('[patch-worker] нет ассетов мода:', assets)
    rmSync(work, { recursive: true, force: true })
    return 1
  }
  cpSync(assets, join(work, 'ymod'), { recursive: true })

  // ffmpeg нужен для перекодирования видео-фонов; кладём его в ресурсы Яндекса.
  const ffmpegSource = join(__dirname, 'ffmpeg.exe')
  if (existsSync(ffmpegSource) && !existsSync(ffmpegTarget)) copyFileSync(ffmpegSource, ffmpegTarget)

  await asar.createPackage(work, asarPath)
  rmSync(work, { recursive: true, force: true })

  disableIntegrityFuse(exePath)
  writeFileSync(
    marker,
    JSON.stringify({ installedAt: Date.now(), ffmpeg: existsSync(ffmpegSource) ? ffmpegSource : '' }, null, 2)
  )
  console.log('[patch-worker] мод внедрён в', dir)
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[patch-worker] ошибка:', error)
    process.exit(1)
  })
