import type { ElectronAPI } from '../../../preload/main'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export const api = window.api
