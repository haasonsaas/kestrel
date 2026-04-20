import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

const UPDATE_OWNER = 'evalops'
const UPDATE_REPO = 'kestrel'
const ALLOWED_UPDATE_HOSTS = new Set(['github.com'])
const SAFE_GITHUB_SLUG = /^[a-zA-Z0-9_.-]+$/u

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
  autoUpdater.setFeedURL(validatedGitHubUpdateFeed(UPDATE_OWNER, UPDATE_REPO))

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

function validatedGitHubUpdateFeed(owner: string, repo: string): { provider: 'github'; owner: string; repo: string } {
  const safeOwner = validateGithubSlug(owner, 'owner')
  const safeRepo = validateGithubSlug(repo, 'repo')
  validateUpdateUrl(`https://github.com/${safeOwner}/${safeRepo}/releases`)
  return {
    provider: 'github',
    owner: safeOwner,
    repo: safeRepo
  }
}

function validateGithubSlug(value: string, label: string): string {
  const trimmed = value.trim()
  if (!SAFE_GITHUB_SLUG.test(trimmed)) {
    throw new Error(`Invalid update ${label}.`)
  }
  return trimmed
}

function validateUpdateUrl(rawUrl: string): void {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid update URL.')
  }

  if (url.protocol !== 'https:') {
    throw new Error('Update URL must use HTTPS.')
  }
  if (!ALLOWED_UPDATE_HOSTS.has(url.hostname)) {
    throw new Error('Update URL host is not allowed.')
  }
  if (!url.pathname.startsWith(`/${UPDATE_OWNER}/${UPDATE_REPO}/releases`)) {
    throw new Error('Update URL path is not allowed.')
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
