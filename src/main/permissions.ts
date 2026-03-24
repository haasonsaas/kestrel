/**
 * Permission checker for macOS system permissions.
 * Checks Accessibility, Microphone, and Screen Recording status.
 */
import { systemPreferences, ipcMain } from 'electron'
import type { ContextKitClient } from './native/contextkit-client'

export interface PermissionState {
  accessibility: boolean
  microphone: boolean
  screenRecording: boolean
  allGranted: boolean
}

let contextKitRef: ContextKitClient | null = null

export function registerPermissionHandlers(contextKit: ContextKitClient | null): void {
  contextKitRef = contextKit

  ipcMain.handle('permissions:check', async (): Promise<PermissionState> => {
    return checkAllPermissions()
  })

  ipcMain.handle('permissions:request', async (_e, permission: string): Promise<boolean> => {
    switch (permission) {
      case 'microphone':
        return await systemPreferences.askForMediaAccess('microphone')
      case 'accessibility':
        // Can't request programmatically — open System Settings
        const { shell } = await import('electron')
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
        return false
      case 'screenRecording':
        const { shell: s } = await import('electron')
        s.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
        return false
      default:
        return false
    }
  })

  ipcMain.handle('permissions:openSettings', async (_e, pane?: string) => {
    const { shell } = await import('electron')
    const panes: Record<string, string> = {
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    }
    shell.openExternal(panes[pane || 'accessibility'] || panes.accessibility)
  })
}

async function checkAllPermissions(): Promise<PermissionState> {
  // Microphone
  const microphone = systemPreferences.getMediaAccessStatus('microphone') === 'granted'

  // Screen Recording
  const screenRecording = systemPreferences.getMediaAccessStatus('screen') === 'granted'

  // Accessibility — check via ContextKit
  let accessibility = false
  if (contextKitRef) {
    try {
      const result = await contextKitRef.checkPermissions()
      accessibility = result.accessibility
    } catch {
      accessibility = false
    }
  }

  return {
    accessibility,
    microphone,
    screenRecording,
    allGranted: accessibility && microphone
  }
}
