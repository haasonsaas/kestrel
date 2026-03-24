import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels, IpcEvents } from '../shared/ipc'

type Unsubscribe = () => void

const api = {
  invoke: <C extends keyof IpcChannels>(
    channel: C,
    ...args: IpcChannels[C]['args']
  ): Promise<IpcChannels[C]['return']> => ipcRenderer.invoke(channel, ...args),

  on: <E extends keyof IpcEvents>(
    event: E,
    callback: (data: IpcEvents[E]) => void
  ): Unsubscribe => {
    const listener = (_event: Electron.IpcRendererEvent, data: IpcEvents[E]) => callback(data)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for renderer access
export type ElectronAPI = typeof api
