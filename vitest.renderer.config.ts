import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
      'src/renderer/src/**/*.test.ts',
      'src/main/adapters/*.vitest.ts'
    ],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true
  }
})
