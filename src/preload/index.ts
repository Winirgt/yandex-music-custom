import { ipcRenderer } from 'electron'
import { startInjector, type Transport } from './core'

/** Preload standalone-обёртки: связь с main через IPC. */
const transport: Transport = {
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: <T>(channel: string, data?: unknown) => ipcRenderer.invoke(channel, data) as Promise<T>,
  on: (channel, callback) => {
    ipcRenderer.on(channel, (_event, data) => callback(data as never))
  }
}

startInjector(transport)
