import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { fileURLToPath } from 'url'
import { normalize } from 'path'

const ALLOWED_RENDERER_PAGES = new Set(['main', 'overlay', 'status', 'hummingbird'])

let installed = false

export function installIpcOriginGuard(): void {
  if (installed) return
  installed = true

  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel, listener) => {
    originalHandle(channel, (event, ...args) => {
      assertTrustedIpcSender(event)
      return listener(event, ...args)
    })
  }) as typeof ipcMain.handle
}

export function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? event.sender.getURL()
  if (!isTrustedRendererUrl(url)) {
    throw new Error(`Blocked IPC from untrusted sender: ${redactUrl(url)}`)
  }
}

function isTrustedRendererUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  if (parsed.protocol === 'file:') {
    return isTrustedFileRenderer(parsed)
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return isTrustedDevRenderer(parsed, process.env['ELECTRON_RENDERER_URL'])
  }

  return false
}

function isTrustedDevRenderer(url: URL, rendererBaseUrl: string): boolean {
  let base: URL
  try {
    base = new URL(rendererBaseUrl)
  } catch {
    return false
  }

  if (url.origin !== base.origin) return false
  const page = url.pathname.split('/').filter(Boolean)[0]
  return ALLOWED_RENDERER_PAGES.has(page)
}

function isTrustedFileRenderer(url: URL): boolean {
  let filePath: string
  try {
    filePath = normalize(fileURLToPath(url))
  } catch {
    return false
  }

  const parts = filePath.split(/[\\/]+/u)
  const rendererIndex = parts.lastIndexOf('renderer')
  if (rendererIndex === -1) return false

  const page = parts[rendererIndex + 1]
  const file = parts[rendererIndex + 2]
  return ALLOWED_RENDERER_PAGES.has(page) && file === 'index.html'
}

function redactUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '<empty>'
  try {
    const url = new URL(rawUrl)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '<invalid>'
  }
}
