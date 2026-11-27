import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Инжектор для официального приложения: самодостаточный IIFE-бандл,
// который выполняется через webContents.executeJavaScript (без require/exports).
export default defineConfig({
  build: {
    outDir: 'out/mod',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/mod/injector.ts'),
      formats: ['iife'],
      name: 'ymodInjector',
      fileName: () => 'injector.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
})
