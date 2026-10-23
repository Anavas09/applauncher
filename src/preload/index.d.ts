import { ElectronAPI } from '@electron-toolkit/preload'
type LauncherApp = { id: string; name: string; cwd: string; command: string }
declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getRunning: () => Promise<string[]>
      listApps: () => Promise<LauncherApp[]>
      onLog: (cb: (p: { id: string; data: string }) => void) => () => void
      onStatus: (cb: (p: { id: string; running: boolean }) => void) => () => void
      openApp: (port: string) => Promise<{ ok: boolean }>
      saveApps: (apps: LauncherApp[]) => Promise<{ ok: boolean }>
      startApp: (config: LauncherApp) => Promise<{ ok: boolean; error?: string }>
      stopApp: (id: string) => Promise<{ ok: boolean }>
      pickFolder: () => Promise<string | null>
    }
  }
}
