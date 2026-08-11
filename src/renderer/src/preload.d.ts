import type { DataKoalaApi } from '../preload/index'

declare global {
  interface Window {
    datakoala: DataKoalaApi
  }
}

export {}
