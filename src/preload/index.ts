import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getRunning: () => ipcRenderer.invoke('app:running'),
  listApps: () => ipcRenderer.invoke('apps:list'),
  onLog: (cb: (p: { id: string; data: string }) => void) => {
    const handler = (_e: unknown, p: { id: string; data: string }): void => cb(p)
    ipcRenderer.on('app:log', handler)
    return () => ipcRenderer.removeListener('app:log', handler)
  },
  onStatus: (cb: (p: { id: string; running: boolean }) => void) => {
    const handler = (_e: unknown, p: { id: string; running: boolean }): void => cb(p)
    ipcRenderer.on('app:status', handler)
    return () => ipcRenderer.removeListener('app:status', handler)
  },
  openApp: (port: string) => ipcRenderer.invoke('app:open', port),
  saveApps: (apps: unknown[]) => ipcRenderer.invoke('apps:save', apps),
  startApp: (config: { id: string; cwd: string; command: string }) =>
    ipcRenderer.invoke('app:start', config),
  stopApp: (id: string) => ipcRenderer.invoke('app:stop', id),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
