import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { createMainWindow } from './windows/mainWindow'
import { createOverlayPanel, toggleOverlay } from './windows/overlayPanel'
import { createMeetingStatusPanel } from './windows/meetingStatus'
import { initDatabase, getDatabase, closeDatabase } from './db'
import * as schema from './db/schema'
import { registerIpcHandlers } from './ipc/handlers'
import { registerAIHandlers, setContextKit } from './ai/handlers'
import { ContextKitClient } from './native/contextkit-client'
import {
  registerMeetingHandlers,
  isRecording,
  getActiveMeetingId,
  startMeetingRecording,
  stopMeetingRecording
} from './meetings/handlers'
import { detectMeeting } from './meetings/detector'
import { registerPermissionHandlers } from './permissions'
import { registerJournalHandlers } from './journal/handlers'
import { MCPServerManager } from './mcp/manager'
import { registerMCPHandlers } from './mcp/handlers'
import { shouldExcludeContext } from './privacy/rules'
import { WideEvent, getEventSnapshot, getRecentEvents } from './observability/wide-event'

let mainWindow: BrowserWindow | null = null
let overlayPanel: BrowserWindow | null = null
let meetingStatusPanel: BrowserWindow | null = null
let contextKit: ContextKitClient | null = null
const mcpManager = new MCPServerManager()

// Meeting auto-detect state
let meetingGraceTimer: ReturnType<typeof setTimeout> | null = null
let lastSnapshotTime = 0

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kestrel.app')

  // Initialize database
  initDatabase()

  // Emit app start event
  WideEvent.emit('app_start', {
    platform: process.platform,
    electron_version: process.versions.electron,
    node_version: process.versions.node
  })

  // Start ContextKit native helper first (AI handlers need it)
  contextKit = new ContextKitClient()
  contextKit.start().catch((err) => {
    console.warn('[contextkit] Failed to start:', err.message)
  })

  // Register IPC handlers
  registerIpcHandlers()
  registerAIHandlers(contextKit, mcpManager)
  registerMeetingHandlers(contextKit)
  registerJournalHandlers()
  registerMCPHandlers(mcpManager)
  registerPermissionHandlers(contextKit)

  // Context IPC handlers
  ipcMain.handle('context:get', async () => {
    console.log('[ipc] context:get called, contextKit exists:', !!contextKit)
    if (!contextKit) return null
    try {
      const result = await contextKit.getContext()
      console.log('[ipc] context:get result:', result?.appName ?? 'null')
      return result
    } catch (err) {
      console.error('[ipc] context:get error:', err)
      return null
    }
  })

  ipcMain.handle('context:checkPermissions', async () => {
    console.log('[ipc] context:checkPermissions called, contextKit exists:', !!contextKit)
    if (!contextKit) return { accessibility: false, screenRecording: false, microphone: false }
    try {
      const result = await contextKit.checkPermissions()
      console.log('[ipc] context:checkPermissions result:', JSON.stringify(result))
      return result
    } catch (err) {
      console.error('[ipc] context:checkPermissions error:', err)
      return { accessibility: false, screenRecording: false, microphone: false }
    }
  })

  // Create windows
  mainWindow = createMainWindow()
  mcpManager.setMainWindow(mainWindow)
  overlayPanel = createOverlayPanel()
  meetingStatusPanel = createMeetingStatusPanel()

  // Event viewer IPC
  ipcMain.handle('events:snapshot', async (_e, windowMinutes?: number) => {
    return getEventSnapshot(windowMinutes ?? 60)
  })

  ipcMain.handle('events:recent', async (_e, limit?: number) => {
    return getRecentEvents(limit ?? 50)
  })

  // Register global shortcuts
  const overlayShortcut = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (overlayPanel) toggleOverlay(overlayPanel)
  })

  if (!overlayShortcut) {
    console.warn('Failed to register overlay shortcut (Cmd+Shift+Space)')
  }

  // Cmd+N: Create new chat thread and focus main window
  const newChatShortcut = globalShortcut.register('CommandOrControl+N', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('app:newChat', {})
    }
  })
  if (!newChatShortcut) {
    console.warn('Failed to register new chat shortcut (Cmd+N)')
  }

  // Cmd+Shift+R: Toggle meeting recording
  const toggleRecordingShortcut = globalShortcut.register('CommandOrControl+Shift+R', async () => {
    if (isRecording()) {
      const meetingId = getActiveMeetingId()
      if (meetingId) {
        await stopMeetingRecording(meetingId)
        console.log('[shortcut] Stopped meeting recording')
      }
    } else {
      const id = await startMeetingRecording('Meeting', 'Manual Recording')
      console.log('[shortcut] Started meeting recording:', id)
    }
  })
  if (!toggleRecordingShortcut) {
    console.warn('Failed to register toggle recording shortcut (Cmd+Shift+R)')
  }

  // IPC: Window controls
  ipcMain.handle('window:toggleOverlay', () => {
    if (overlayPanel) toggleOverlay(overlayPanel)
  })

  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  // Helper to read a setting from the DB
  function getSetting(key: string): unknown {
    try {
      const db = getDatabase()
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
      return row ? JSON.parse(row.value) : null
    } catch {
      return null
    }
  }

  // Helper to send IPC push events to all renderer windows
  function sendToAllRenderers(channel: string, data: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
  }

  // Context polling + meeting auto-detection (every 5 seconds)
  // Context snapshots are saved every 30 seconds (controlled by lastSnapshotTime)
  let pollCount = 0
  setInterval(async () => {
    if (!contextKit) return
    try {
      const context = await contextKit.getContext()
      if (!context) {
        console.log('[auto-detect] context is null/undefined, skipping')
        return
      }

      // Log full context every 5th poll (every 25s) to avoid spam
      pollCount++
      if (pollCount % 5 === 1) {
        console.log(`[auto-detect] poll #${pollCount} — app=${context.appName} bundleId=${context.bundleId} url=${context.url ?? 'NONE'} windowTitle=${context.windowTitle?.slice(0, 60) ?? 'NONE'}`)
      }

      // ── Meeting auto-detection ──────────────────────────────
      const autoDetect = getSetting('autoDetectMeetings')
      // Default to TRUE if not explicitly set
      const autoDetectEnabled = autoDetect === null || autoDetect === undefined || autoDetect === true || autoDetect === 'true'

      if (!autoDetectEnabled) {
        if (pollCount % 5 === 1) {
          console.log(`[auto-detect] DISABLED — autoDetect setting raw value: ${JSON.stringify(autoDetect)} (type: ${typeof autoDetect})`)
        }
      }

      if (autoDetectEnabled) {
        // PRIMARY: CoreAudio mic activity detection — works even when meeting
        // app is NOT the frontmost window. Checks which processes are actively
        // using the microphone input.
        const micDetection = await contextKit.detectMeetingByMic()

        // SECONDARY: Frontmost app + URL detection (supplements mic detection)
        const frontDetection = detectMeeting(
          context.bundleId,
          context.url,
          context.windowTitle
        )

        const detected = micDetection.meetingDetected || frontDetection.detected
        const meetingApp = micDetection.meetingApp || frontDetection.app || 'Meeting'
        const meetingTitle = frontDetection.title || micDetection.meetingApp || 'Meeting'

        if (pollCount % 5 === 1) {
          console.log(`[auto-detect] mic: detected=${micDetection.meetingDetected} app=${micDetection.meetingApp ?? 'none'} users=[${micDetection.micUsers.map(u => u.bundleId).join(',')}]`)
          console.log(`[auto-detect] front: detected=${frontDetection.detected} app="${frontDetection.app}" | combined=${detected} | isRecording=${isRecording()}`)
        }

        if (detected && !isRecording()) {
          const detectEvent = WideEvent.start('meeting_autodetect', {
            meeting_app: meetingApp,
            meeting_title: meetingTitle,
            detection_source: micDetection.meetingDetected ? 'mic_activity' : 'frontmost_app',
            mic_users: micDetection.micUsers.map(u => u.bundleId).join(','),
            source_bundle: context.bundleId,
            source_url: context.url ?? null
          })
          console.log(`[auto-detect] MEETING DETECTED: ${meetingApp} — ${meetingTitle} (via ${micDetection.meetingDetected ? 'mic activity' : 'frontmost app'})`)
          const meetingId = await startMeetingRecording(meetingTitle, meetingApp)
          detectEvent.set('meeting_id', meetingId)
          detectEvent.finish()
          sendToAllRenderers('meeting:detected', {
            app: meetingApp,
            title: meetingTitle,
            meetingId
          })

          if (meetingGraceTimer) {
            clearTimeout(meetingGraceTimer)
            meetingGraceTimer = null
          }
        } else if (!detected && isRecording() && getActiveMeetingId()) {
          // No meeting signal — start grace period before auto-stopping
          if (!meetingGraceTimer) {
            console.log('[auto-detect] No meeting signal, starting 30s grace period')
            const meetingId = getActiveMeetingId()!
            meetingGraceTimer = setTimeout(async () => {
              if (isRecording() && getActiveMeetingId() === meetingId) {
                // Final recheck using mic activity
                const finalCheck = await contextKit!.detectMeetingByMic()
                if (!finalCheck.meetingDetected) {
                  console.log('[auto-detect] Grace period expired, auto-stopping')
                  await stopMeetingRecording(meetingId)
                  sendToAllRenderers('meeting:autoStopped', {
                    meetingId,
                    reason: 'No meeting audio detected'
                  })
                  WideEvent.emit('meeting_stop', { meeting_id: meetingId, reason: 'auto_grace_expired' })
                } else {
                  console.log('[auto-detect] Meeting mic still active during grace, continuing')
                }
              }
              meetingGraceTimer = null
            }, 30000)
          }
        } else if (detected && isRecording() && meetingGraceTimer) {
          // Meeting is back — cancel the grace timer
          console.log('[auto-detect] Meeting re-detected, cancelling grace timer')
          clearTimeout(meetingGraceTimer)
          meetingGraceTimer = null
        }
      }

      // ── Context snapshots (every 30 seconds) ───────────────
      const now = Date.now()
      if (now - lastSnapshotTime >= 30000) {
        lastSnapshotTime = now
        if (!shouldExcludeContext(context)) {
          const db = getDatabase()
          db.insert(schema.contextSnapshots).values({
            id: uuid(),
            appName: context.appName,
            bundleId: context.bundleId,
            windowTitle: context.windowTitle ?? null,
            url: context.url ?? null,
            content: context.visibleText?.join('\n').slice(0, 4000) ?? null,
            createdAt: new Date()
          }).run()
        }
      }
    } catch (err) {
      console.warn('[context-poll] Failed:', err)
    }
  }, 5000)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl+R in production
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 || !mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow()
    } else {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  contextKit?.shutdown()
  mcpManager.stopAll()
  closeDatabase()
})
