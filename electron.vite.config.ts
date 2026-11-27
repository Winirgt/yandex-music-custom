import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // ws и @electron/asar бандлим внутрь (в установленном приложении нет node_modules),
    // electron оставляем внешним.
    plugins: [externalizeDepsPlugin({ exclude: ['ws', '@electron/asar'] })],
    build: {
      rollupOptions: {
        // original-fs существует только внутри Electron — оставляем require как есть.
        external: ['original-fs'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // main-модуль для внедрения в официальное приложение Яндекс Музыки
          mod: resolve(__dirname, 'src/mod/main.ts'),
          // воркер патчера (обычный Node через ELECTRON_RUN_AS_NODE)
          'patch-worker': resolve(__dirname, 'src/main/patch-worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          settings: resolve(__dirname, 'src/preload/settings.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
