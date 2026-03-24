import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function createMeetingStatusPanel(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
  const panelWidth = 300
  const panelHeight = 72

  const status = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    x: Math.round((screenWidth - panelWidth) / 2),
    y: 12,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    type: 'panel',
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/status.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  status.setAlwaysOnTop(true, 'floating')
  status.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    status.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/status/`)
  } else {
    status.loadFile(join(__dirname, '../renderer/status/index.html'))
  }

  return status
}
