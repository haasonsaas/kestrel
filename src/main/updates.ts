import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

export interface UpdateStatus {
  available: boolean
  checking: boolean
  downloaded: boolean
  error?: string
  info?: UpdateInfo
}

let status: UpdateStatus = {
  available: false,
  checking: false,
  downloaded: false
}

export function registerUpdateHandlers(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'evalops',
    repo: 'kestrel'
  })

  autoUpdater.on('checking-for-update', () => {
    status = { ...status, checking: true, error: undefined }
    broadcastUpdateStatus()
  })

  autoUpdater.on('update-available', (info) => {
    status = { available: true, checking: false, downloaded: false, info }
    broadcastUpdateStatus()
  })

  autoUpdater.on('update-not-available', (info) => {
    status = { available: false, checking: false, downloaded: false, info }
    broadcastUpdateStatus()
  })

  autoUpdater.on('update-downloaded', (info) => {
    status = { available: true, checking: false, downloaded: true, info }
    broadcastUpdateStatus()
  })

  autoUpdater.on('error', (error) => {
    status = {
      ...status,
      checking: false,
      error: error instanceof Error ? error.message : String(error)
    }
    broadcastUpdateStatus()
  })

  ipcMain.handle('app:updateStatus', () => status)
  ipcMain.handle('app:checkForUpdates', async () => checkForUpdates())
  ipcMain.handle('app:installUpdate', () => {
    if (!status.downloaded) return false
    autoUpdater.quitAndInstall(false, true)
    return true
  })

  if (app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates()
    }, 10_000)
  }
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged && process.env.KESTREL_ENABLE_UPDATES_IN_DEV !== '1') {
    status = {
      available: false,
      checking: false,
      downloaded: false,
      error: 'Auto-update checks are only enabled in packaged builds.'
    }
    return status
  }

  await autoUpdater.checkForUpdates()
  return status
}

function broadcastUpdateStatus(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('app:updateStatusChanged', status)
    }
  }
}
