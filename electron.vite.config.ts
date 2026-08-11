import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        // `pg` has an optional `pg-native` binding we never use. Without this the
        // dev-mode bundle fails to resolve it and the main process refuses to boot.
        // DuckDB chooses its native addon from process.platform/process.arch at
        // runtime. Bundling this package makes Rollup inline every platform branch
        // and can leave a hard-coded binding for the build host in the output.
        external: ['pg-native', '@duckdb/node-api']
      }
    },
    resolve: {
      alias: { '@main': resolve(__dirname, 'src/main'), '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } }
    },
    plugins: [react()]
  }
})
