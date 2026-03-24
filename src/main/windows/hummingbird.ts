import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 520
const MIN_WIDTH = 320
const MIN_HEIGHT = 280
const MAX_HEIGHT = 800

export function createHummingbirdWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const hb = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    x: screenWidth - DEFAULT_WIDTH - 20,
    y: Math.round(screenHeight / 2 - DEFAULT_HEIGHT / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    type: 'panel',
    hasShadow: true,
    roundedCorners: true,
    vibrancy: 'popover',
    visualEffectState: 'active',
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/hummingbird.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  hb.setAlwaysOnTop(true, 'floating')
  hb.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hb.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/hummingbird/`)
  } else {
    hb.loadFile(join(__dirname, '../renderer/hummingbird/index.html'))
  }

  return hb
}

export function toggleHummingbird(hb: BrowserWindow, voiceMode = false): void {
  if (hb.isVisible() && !voiceMode) {
    hb.hide()
  } else {
    if (!hb.isVisible()) {
      // Position near cursor or right side of screen
      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor)
      const { width: screenWidth, height: screenHeight } = display.workArea
      const [w, h] = hb.getSize()

      // Position to the right of cursor, centered vertically
      let x = cursor.x + 20
      let y = cursor.y - Math.round(h / 2)

      // Keep within screen bounds
      if (x + w > display.workArea.x + screenWidth) {
        x = cursor.x - w - 20
      }
      if (y < display.workArea.y) y = display.workArea.y + 10
      if (y + h > display.workArea.y + screenHeight) {
        y = display.workArea.y + screenHeight - h - 10
      }

      hb.setPosition(x, y)
    }

    hb.show()
    hb.focus()

    // Tell renderer about voice mode
    if (voiceMode) {
      hb.webContents.send('hummingbird:voiceMode', { active: true })
    }
  }
}

export function hideHummingbird(hb: BrowserWindow): void {
  if (hb.isVisible()) {
    hb.hide()
  }
}
