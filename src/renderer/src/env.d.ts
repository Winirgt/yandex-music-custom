import type { SettingsApi } from '../../shared/types'

declare global {
  interface Window {
    ymSettings: SettingsApi
  }
}

export {}
