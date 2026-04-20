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
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9._:@-]{1,160}$/u
const SAFE_QUERY_VALUE = /^[a-zA-Z0-9._:@ -]{0,200}$/u

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

  const parts = sanitizedPathParts(parsed)
  if (!parts || parts.length === 0 || parts.length > 2) return null

  const root = parts[0]?.toLowerCase() ?? ''
  const id = parts[1]
  const params = sanitizedSearchParams(parsed)

  if (root === 'agent' || root === 'agents') {
    if (!id) return null
    return target(rawUrl, 'agent', 'evalops', id, params)
  }
  if (root === 'trace' || root === 'traces') {
    if (!id) return null
    return target(rawUrl, 'trace', 'events', id, params)
  }
  if (root === 'approval' || root === 'approvals') {
    if (!id) return null
    return target(rawUrl, 'approval', 'evalops', id, params)
  }
  if (root === 'settings') {
    const settingsTab = normalizeSettingsTab(id) ?? normalizeSettingsTab(params.tab) ?? 'evalops'
    return target(rawUrl, 'settings', settingsTab, undefined, params)
  }

  return null
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

function sanitizedPathParts(url: URL): string[] | null {
  const rawParts = [
    url.hostname,
    ...url.pathname.split('/')
  ].filter(Boolean)
  const parts: string[] = []

  for (const part of rawParts) {
    let decoded: string
    try {
      decoded = decodeURIComponent(part).trim()
    } catch {
      return null
    }

    if (!decoded) continue
    if (!SAFE_PATH_SEGMENT.test(decoded)) return null
    if (decoded === '.' || decoded === '..') return null
    parts.push(decoded)
  }

  return parts
}

function sanitizedSearchParams(url: URL): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) {
    if (!SAFE_PATH_SEGMENT.test(key)) continue
    if (!SAFE_QUERY_VALUE.test(value)) continue
    params[key] = value.trim()
  }
  return params
}
