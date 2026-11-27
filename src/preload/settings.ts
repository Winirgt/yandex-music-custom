import { contextBridge, ipcRenderer } from 'electron'
import type { AudioStatus, SettingsApi, SettingsPatch, SettingsPayload } from '../shared/types'

/** Preload локального окна настроек: наружу только узкий API. */
const api: SettingsApi = {
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<SettingsPayload>,
  update: (patch: SettingsPatch) => ipcRenderer.invoke('settings:update', patch) as Promise<SettingsPayload>,
  chooseMedia: () => ipcRenderer.invoke('settings:choose-media') as Promise<SettingsPayload | null>,
  selectMediaPath: (path: string) => ipcRenderer.invoke('settings:select-media-path', path) as Promise<SettingsPayload | null>,
  clearMedia: () => ipcRenderer.invoke('settings:clear-media') as Promise<SettingsPayload>,
  applyProfile: (profileId: string) => ipcRenderer.invoke('settings:apply-profile', profileId) as Promise<SettingsPayload>,
  resetAll: () => ipcRenderer.invoke('settings:reset') as Promise<SettingsPayload>,
  getAudioStatus: () => ipcRenderer.invoke('audio:get-status') as Promise<AudioStatus>,
  reattachAudio: () => ipcRenderer.send('audio:reattach'),
  onAudioStatus: (callback) => {
    ipcRenderer.on('audio:status', (_event, status: AudioStatus) => callback(status))
  },
  close: () => ipcRenderer.send('settings:close'),
  onRequestClose: (callback) => {
    ipcRenderer.on('settings:request-close', () => callback())
  }
}

contextBridge.exposeInMainWorld('ymSettings', api)
