import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/preload/main.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
          status: resolve(__dirname, 'src/preload/status.ts'),
          hummingbird: resolve(__dirname, 'src/preload/hummingbird.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/main/src'),
        '@overlay': resolve('src/renderer/overlay/src'),
        '@status': resolve('src/renderer/status/src'),
        '@hummingbird': resolve('src/renderer/hummingbird/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/main/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay/index.html'),
          status: resolve(__dirname, 'src/renderer/status/index.html'),
          hummingbird: resolve(__dirname, 'src/renderer/hummingbird/index.html')
        }
      }
    }
  }
})
