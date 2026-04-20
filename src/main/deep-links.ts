import { app, BrowserWindow, ipcMain } from 'electron'
import type { AppDeepLinkSettingsTab, AppDeepLinkTarget } from '../shared/ipc'

type MainWindowGetter = () => BrowserWindow | null

const SETTINGS_TABS = new Set<AppDeepLinkSettingsTab>([
  'general',
  'permissions',
  'appearance',
  'privacy',
  'evalops',
  'apikeys',
  'mcp',
  'shortcuts',
  'events'
])

let getMainWindow: MainWindowGetter = () => null
let pendingDeepLink: AppDeepLinkTarget | null = null

export function registerEvalOpsProtocol(): void {
  app.setAsDefaultProtocolClient('evalops')
}

export function registerDeepLinkHandlers(options: { getMainWindow: MainWindowGetter }): void {
  getMainWindow = options.getMainWindow

  ipcMain.handle('app:openDeepLink', (_event, url: string) => openEvalOpsDeepLink(url))
  ipcMain.handle('app:getPendingDeepLink', () => {
    const pending = pendingDeepLink
    pendingDeepLink = null
    return pending
  })

  flushPendingDeepLink()
}

export function openEvalOpsDeepLink(rawUrl: string): AppDeepLinkTarget | null {
  const target = parseEvalOpsDeepLink(rawUrl)
  if (!target) return null

  pendingDeepLink = target
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return target

  mainWindow.show()
  mainWindow.focus()
  flushPendingDeepLink()
  return target
}

export function findEvalOpsDeepLinkArg(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith('evalops://'))
}

function flushPendingDeepLink(): void {
  if (!pendingDeepLink) return
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return

  const target = pendingDeepLink
  const send = (clearPending: boolean) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:deepLink', target)
      if (clearPending) pendingDeepLink = null
    }
  }

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => send(false))
  } else {
    send(true)
  }
}

function parseEvalOpsDeepLink(rawUrl: string): AppDeepLinkTarget | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== 'evalops:') return null

  const parts = [
    parsed.hostname,
    ...parsed.pathname.split('/').map((part) => decodeURIComponent(part)).filter(Boolean)
  ].filter(Boolean)
  const root = parts[0]?.toLowerCase() ?? ''
  const id = parts[1]
  const params = Object.fromEntries(parsed.searchParams.entries())

  if (root === 'agent' || root === 'agents') {
    return target(rawUrl, 'agent', 'evalops', id, params)
  }
  if (root === 'trace' || root === 'traces') {
    return target(rawUrl, 'trace', 'events', id, params)
  }
  if (root === 'approval' || root === 'approvals') {
    return target(rawUrl, 'approval', 'evalops', id, params)
  }
  if (root === 'settings') {
    return target(rawUrl, 'settings', normalizeSettingsTab(id) ?? 'evalops', undefined, params)
  }

  return {
    url: rawUrl,
    kind: 'unknown',
    nav: 'settings',
    settingsTab: 'evalops',
    id,
    params
  }
}

function target(
  url: string,
  kind: AppDeepLinkTarget['kind'],
  settingsTab: AppDeepLinkSettingsTab,
  id: string | undefined,
  params: Record<string, string>
): AppDeepLinkTarget {
  return {
    url,
    kind,
    nav: 'settings',
    settingsTab,
    id,
    params
  }
}

function normalizeSettingsTab(value: string | undefined): AppDeepLinkSettingsTab | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase()
  return SETTINGS_TABS.has(normalized as AppDeepLinkSettingsTab)
    ? normalized as AppDeepLinkSettingsTab
    : undefined
}
