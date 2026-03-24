import { BrowserWindow, shell } from 'electron'
import windowState from 'electron-window-state'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function createMainWindow(): BrowserWindow {
  const state = windowState({
    defaultWidth: 1200,
    defaultHeight: 800
  })

  const mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#fafaf8',
    webPreferences: {
      preload: join(__dirname, '../preload/main.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  state.manage(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/main/`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/main/index.html'))
  }

  return mainWindow
}
