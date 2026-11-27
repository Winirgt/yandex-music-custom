import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function officialDir(): string | null {
  const candidates = [
    process.env['YMOD_TARGET_DIR'],
    join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'YandexMusic')
  ].filter(Boolean) as string[]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'resources', 'app.asar'))) return dir
  }
  return null
}

function modAssetsDir(): string {
  return process.env['YMOD_MOD_SRC'] ?? join(process.resourcesPath, 'ymod-mod')
}

/**
 * Патч официального приложения выполняем в дочернем Node-процессе
 * (ELECTRON_RUN_AS_NODE), чтобы fs не был патчен asar-обёрткой Electron.
 */
export function runPatcher(mode: 'patch' | 'unpatch'): Promise<number> {
  return new Promise((resolve) => {
    const dir = officialDir()
    if (!dir) {
      console.error('[patcher] Официальное приложение Яндекс Музыки не найдено.')
      resolve(1)
      return
    }
    const worker = existsSync(join(process.resourcesPath, 'patch-worker.js'))
      ? join(process.resourcesPath, 'patch-worker.js')
      : join(__dirname, 'patch-worker.js')
    const child = spawn(process.execPath, [worker, mode, dir, modAssetsDir()], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (d) => process.stdout.write(d))
    child.stderr.on('data', (d) => process.stderr.write(d))
    child.on('exit', (code) => resolve(code ?? 1))
    child.on('error', (error) => {
      console.error('[patcher] не удалось запустить воркер:', error)
      resolve(1)
    })
  })
}
