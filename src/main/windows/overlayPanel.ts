import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function createOverlayPanel(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const panelWidth = 420
  const panelHeight = screenHeight

  const overlay = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    x: screenWidth - panelWidth,
    y: 0,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    type: 'panel',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  overlay.setAlwaysOnTop(true, 'floating')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/`)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }

  return overlay
}

export function toggleOverlay(overlay: BrowserWindow): void {
  if (overlay.isVisible()) {
    overlay.hide()
  } else {
    // Reposition to right edge of current screen
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
    const panelWidth = 420
    overlay.setBounds({
      x: screenWidth - panelWidth,
      y: 0,
      width: panelWidth,
      height: screenHeight
    })
    overlay.show()
    overlay.focus()
  }
}
