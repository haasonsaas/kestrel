/**
 * Permission checker for macOS system permissions.
 *
 * Key insight: check Accessibility from the Electron MAIN PROCESS using
 * systemPreferences.isTrustedAccessibilityClient() — NOT from the child
 * Swift binary. TCC grants permission to the app bundle, and this API
 * checks the app bundle's trust status directly.
 */
import { systemPreferences, ipcMain, shell } from 'electron'

export interface PermissionState {
  accessibility: boolean
  microphone: boolean
  screenRecording: boolean
  allGranted: boolean
}

export function registerPermissionHandlers(): void {
  ipcMain.handle('permissions:check', async (): Promise<PermissionState> => {
    return checkAllPermissions()
  })

  ipcMain.handle('permissions:request', async (_e, permission: string): Promise<boolean> => {
    switch (permission) {
      case 'microphone':
        return await systemPreferences.askForMediaAccess('microphone')
      case 'accessibility':
        // Prompt macOS to show the accessibility dialog, then open Settings
        systemPreferences.isTrustedAccessibilityClient(true)
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
        return false
      case 'screenRecording':
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
        return false
      default:
        return false
    }
  })

  ipcMain.handle('permissions:openSettings', async (_e, pane?: string) => {
    const panes: Record<string, string> = {
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    }
    shell.openExternal(panes[pane || 'accessibility'] || panes.accessibility)
  })
}

function checkAllPermissions(): PermissionState {
  // Accessibility — checked from Electron main process directly
  // This checks the APP BUNDLE's TCC trust, not the child binary's
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false)

  // Microphone
  const microphone = systemPreferences.getMediaAccessStatus('microphone') === 'granted'

  // Screen Recording
  const screenRecording = systemPreferences.getMediaAccessStatus('screen') === 'granted'

  console.log(`[permissions] accessibility=${accessibility} microphone=${microphone} screen=${screenRecording}`)

  return {
    accessibility,
    microphone,
    screenRecording,
    allGranted: accessibility && microphone
  }
}
