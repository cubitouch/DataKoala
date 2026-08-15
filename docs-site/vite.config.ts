import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname),
  base: '/DataKoala/',
  build: { outDir: 'dist', emptyOutDir: true }
})
