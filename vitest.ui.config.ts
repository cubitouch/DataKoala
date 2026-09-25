import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@components': resolve(__dirname, 'src/renderer/src/components'),
      '@lib': resolve(__dirname, 'src/renderer/src/lib'),
      '@store': resolve(__dirname, 'src/renderer/src/store'),
      '@test': resolve(__dirname, 'src/renderer/src/test'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: [
      'src/renderer/src/**/*.ui.test.{ts,tsx}',
      'src/renderer/src/**/*.test.tsx'
    ],
    environment: 'jsdom',
    clearMocks: true,
    restoreMocks: true
  }
})