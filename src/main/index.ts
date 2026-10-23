import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import treeKill from 'tree-kill'
import icon from '../../resources/icon.png?asset'

let tray: Tray | null = null
let isQuitting = false

function createTray(win: BrowserWindow): void {
  tray = new Tray(icon)
  tray.setToolTip('App Launcher')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar', click: () => win.show() },
      {
        label: 'Salir',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => win.show())
}

const running = new Map<string, ChildProcess>()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  if (!tray) createTray(mainWindow)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  killLeftovers()
  createWindow()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function killTreeSync(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'])
  } else {
    treeKill(pid)
  }
}

function killByPort(port: string): void {
  if (process.platform !== 'win32') return
  const out = spawnSync('netstat', ['-ano']).stdout.toString()
  const pids = new Set<number>()
  out.split('\n').forEach((line) => {
    const cols = line.trim().split(/\s+/)
    // Proto, Local, Foreign, State, PID. En LISTENING el foreign termina en :0
    if (cols[0] === 'TCP' && cols[1]?.endsWith(`:${port}`) && cols[2]?.endsWith(':0')) {
      pids.add(Number(cols[4]))
    }
  })
  pids.forEach((pid) => pid && killTreeSync(pid))
}

const pidsFile = join(app.getPath('userData'), 'pids.json')

function writePids(): void {
  const pids: Record<string, number> = {}
  running.forEach((child, id) => {
    if (child.pid) pids[id] = child.pid
  })
  writeFileSync(pidsFile, JSON.stringify(pids))
}

function killLeftovers(): void {
  try {
    if (existsSync(pidsFile)) {
      const pids: Record<string, number> = JSON.parse(readFileSync(pidsFile, 'utf-8'))
      Object.values(pids).forEach((pid) => killTreeSync(pid))
    }
  } catch {
    // archivo corrupto: se ignora
  }
  try {
    if (existsSync(appsFile)) {
      JSON.parse(readFileSync(appsFile, 'utf-8')).forEach(
        (a: { port?: string }) => a.port && killByPort(a.port)
      )
    }
  } catch {
    // ignorar
  }
  writeFileSync(pidsFile, '{}')
}

app.on('will-quit', () => {
  running.forEach((child) => {
    if (child.pid) killTreeSync(child.pid)
  })
})

app.on('before-quit', () => {
  isQuitting = true
})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const appsFile = join(app.getPath('userData'), 'apps.json')

ipcMain.handle('apps:list', () =>
  existsSync(appsFile) ? JSON.parse(readFileSync(appsFile, 'utf-8')) : []
)

ipcMain.handle('apps:save', (_e, apps) => {
  writeFileSync(appsFile, JSON.stringify(apps, null, 2))
  return { ok: true }
})

const sendLog = (id: string, data: unknown): void =>
  BrowserWindow.getAllWindows().forEach((w) =>
    w.webContents.send('app:log', { id, data: String(data) })
  )

ipcMain.handle('app:start', (_e, { id, cwd, command }) => {
  if (running.has(id)) return { ok: false, error: 'Ya está corriendo' }

  const child = spawn(command, { cwd, shell: true })
  running.set(id, child)
  writePids()
  sendStatus(id, true)

  child.stdout?.on('data', (d) => sendLog(id, d))
  child.stderr?.on('data', (d) => sendLog(id, d))
  child.on('error', (err) => sendLog(id, `[error] ${err.message}\n`))
  child.on('exit', () => {
    running.delete(id)
    writePids()
    sendStatus(id, false)
    sendLog(id, '\n[proceso terminado]\n')
  })

  return { ok: true }
})

ipcMain.handle('app:stop', (_e, id: string) => {
  const child = running.get(id)
  if (!child?.pid) return { ok: false }
  treeKill(child.pid)
  return { ok: true }
})

const sendStatus = (id: string, isRunning: boolean): void =>
  BrowserWindow.getAllWindows().forEach((w) =>
    w.webContents.send('app:status', { id, running: isRunning })
  )

ipcMain.handle('app:running', () => [...running.keys()])

ipcMain.handle('app:open', (_e, port: string) => {
  if (!/^\d+$/.test(port)) return { ok: false }
  shell.openExternal(`http://localhost:${port}`)
  return { ok: true }
})

ipcMain.handle('dialog:pickFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})
