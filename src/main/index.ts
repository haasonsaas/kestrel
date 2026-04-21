import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { v4 as uuid } from 'uuid'
import path from 'path'
import fs from 'fs'
import { createMainWindow } from './windows/mainWindow'
import { createOverlayPanel, toggleOverlay } from './windows/overlayPanel'
import { createMeetingStatusPanel } from './windows/meetingStatus'
import { createHummingbirdWindow, toggleHummingbird, hideHummingbird } from './windows/hummingbird'
import { initDatabase, getDatabase, closeDatabase } from './db'
import * as schema from './db/schema'
import { registerIpcHandlers } from './ipc/handlers'
import { installIpcOriginGuard } from './ipc/security'
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
import { registerEvalOpsHandlers } from './evalops/handlers'
import { registerKestrelAgentInBackground } from './evalops/registration'
import { registerUpdateHandlers } from './updates'
import { registerKeyboardShortcutHandlers, unregisterKeyboardShortcuts } from './shortcuts'
import { registerPlatformNotificationHandlers, unregisterPlatformNotificationHandlers } from './platform-notifications'
import {
  findEvalOpsDeepLinkArg,
  openEvalOpsDeepLink,
  registerDeepLinkHandlers,
  registerEvalOpsProtocol
} from './deep-links'
import { shouldExcludeContext } from './privacy/rules'
import { WideEvent, getEventSnapshot, getRecentEvents } from './observability/wide-event'
import { getSettingValue } from './evalops/settings'

let mainWindow: BrowserWindow | null = null
let overlayPanel: BrowserWindow | null = null
let meetingStatusPanel: BrowserWindow | null = null
let hummingbirdWindow: BrowserWindow | null = null
let contextKit: ContextKitClient | null = null
let tray: Tray | null = null
const mcpManager = new MCPServerManager()

// Meeting auto-detect state
let meetingGraceTimer: ReturnType<typeof setTimeout> | null = null
let lastSnapshotTime = 0

// Voice recording state
let voiceRecordingActive = false

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLink = findEvalOpsDeepLinkArg(argv)
    if (deepLink) {
      openEvalOpsDeepLink(deepLink)
      return
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    openEvalOpsDeepLink(url)
  })

  app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kestrel.app')
  registerEvalOpsProtocol()

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
  installIpcOriginGuard()
  registerIpcHandlers()
  registerAIHandlers(contextKit, mcpManager)
  registerMeetingHandlers(contextKit)
  registerJournalHandlers()
  registerMCPHandlers(mcpManager)
  registerPermissionHandlers()
  registerEvalOpsHandlers()
  registerKestrelAgentInBackground()
  registerUpdateHandlers()

  // Context IPC handlers
  ipcMain.handle('context:get', async () => {
    if (!contextKit) return null
    try {
      return await contextKit.getContext()
    } catch (err) {
      console.error('[ipc] context:get error:', err)
      return null
    }
  })

  ipcMain.handle('context:checkPermissions', async () => {
    if (!contextKit) return { accessibility: false, screenRecording: false, microphone: false }
    try {
      return await contextKit.checkPermissions()
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
  hummingbirdWindow = createHummingbirdWindow()
  registerDeepLinkHandlers({ getMainWindow: () => mainWindow })
  const startupDeepLink = findEvalOpsDeepLinkArg(process.argv)
  if (startupDeepLink) openEvalOpsDeepLink(startupDeepLink)
  registerPlatformNotificationHandlers({ getMainWindow: () => mainWindow })

  // ── System tray ──────────────────────────────────────
  setupTray()

  // Event viewer IPC
  ipcMain.handle('events:snapshot', async (_e, windowMinutes?: number) => {
    return getEventSnapshot(windowMinutes ?? 60)
  })

  ipcMain.handle('events:recent', async (_e, limit?: number) => {
    return getRecentEvents(limit ?? 50)
  })

  // ── Modifier-tap shortcut (double-tap Option) ────────
  setupModifierTapMonitor()

  // ── Global keyboard shortcuts ────────────────────────
  setupKeyboardShortcuts()

  // ── Window control IPC ───────────────────────────────
  ipcMain.handle('window:toggleOverlay', () => {
    if (hummingbirdWindow) toggleHummingbird(hummingbirdWindow)
  })

  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow()
    // Hide hummingbird instead of closing
    if (win === hummingbirdWindow) {
      hideHummingbird(hummingbirdWindow)
    } else {
      win?.close()
    }
  })

  // ── Context polling + meeting auto-detection ─────────
  let pollCount = 0
  setInterval(async () => {
    if (!contextKit) return
    try {
      const context = await contextKit.getContext()
      if (!context) return

      pollCount++

      // ── Meeting auto-detection ──
      const autoDetect = getSetting('autoDetectMeetings')
      const autoDetectEnabled = autoDetect === null || autoDetect === undefined || autoDetect === true || autoDetect === 'true'

      if (autoDetectEnabled) {
        const micDetection = await contextKit.detectMeetingByMic()
        const frontDetection = detectMeeting(context.bundleId, context.url, context.windowTitle)
        const detected = micDetection.meetingDetected || frontDetection.detected
        const meetingApp = micDetection.meetingApp || frontDetection.app || 'Meeting'
        const meetingTitle = frontDetection.title || micDetection.meetingApp || 'Meeting'

        if (detected && !isRecording()) {
          const meetingId = await startMeetingRecording(meetingTitle, meetingApp)
          sendToAllRenderers('meeting:detected', { app: meetingApp, title: meetingTitle, meetingId })
          if (meetingGraceTimer) { clearTimeout(meetingGraceTimer); meetingGraceTimer = null }
        } else if (!detected && isRecording() && getActiveMeetingId()) {
          if (!meetingGraceTimer) {
            const meetingId = getActiveMeetingId()!
            meetingGraceTimer = setTimeout(async () => {
              if (isRecording() && getActiveMeetingId() === meetingId) {
                const finalCheck = await contextKit!.detectMeetingByMic()
                if (!finalCheck.meetingDetected) {
                  await stopMeetingRecording(meetingId)
                  sendToAllRenderers('meeting:autoStopped', { meetingId, reason: 'No meeting audio detected' })
                }
              }
              meetingGraceTimer = null
            }, 30000)
          }
        } else if (detected && isRecording() && meetingGraceTimer) {
          clearTimeout(meetingGraceTimer)
          meetingGraceTimer = null
        }
      }

      // ── Context snapshots (every 30s) ──
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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  unregisterKeyboardShortcuts()
  unregisterPlatformNotificationHandlers()
  contextKit?.shutdown()
  mcpManager.stopAll()
  tray?.destroy()
  closeDatabase()
})

// ── Helper functions ─────────────────────────────────────

function getSetting(key: string): unknown {
  try {
    return getSettingValue(key)
  } catch {
    return null
  }
}

function sendToAllRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

function setupKeyboardShortcuts(): void {
  registerKeyboardShortcutHandlers([
    {
      id: 'toggleQuickAccess',
      label: 'Toggle Quick Access Panel',
      description: 'Show or hide the Hummingbird quick chat window.',
      defaultAccelerator: 'CommandOrControl+Shift+Space',
      run: () => {
        if (hummingbirdWindow) toggleHummingbird(hummingbirdWindow)
      }
    },
    {
      id: 'newChat',
      label: 'New Chat',
      description: 'Open Kestrel and start a new chat thread.',
      defaultAccelerator: 'CommandOrControl+N',
      run: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('app:newChat', {})
        }
      }
    },
    {
      id: 'openCommandPalette',
      label: 'Open Command Palette',
      description: 'Open quick navigation for chats, agents, traces, approvals, and settings.',
      defaultAccelerator: 'CommandOrControl+K',
      run: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('app:openCommandPalette', {})
        }
      }
    },
    {
      id: 'toggleRecording',
      label: 'Toggle Recording',
      description: 'Start or stop a manual meeting recording.',
      defaultAccelerator: 'CommandOrControl+Shift+R',
      run: async () => {
        if (isRecording()) {
          const meetingId = getActiveMeetingId()
          if (meetingId) await stopMeetingRecording(meetingId)
        } else {
          await startMeetingRecording('Meeting', 'Manual Recording')
        }
      }
    }
  ])
}

// ── Modifier-tap monitor setup ───────────────────────────

function setupModifierTapMonitor(): void {
  if (!contextKit) return

  // Listen for modifier events from ContextKit
  contextKit.on('modifierTap', () => {
    console.log('[modifier] Double-tap Option detected — toggling hummingbird')
    if (hummingbirdWindow) toggleHummingbird(hummingbirdWindow)
  })

  contextKit.on('modifierHoldStarted', () => {
    console.log('[modifier] Option hold started — voice mode')
    if (hummingbirdWindow) {
      toggleHummingbird(hummingbirdWindow, true)
      startVoiceRecording()
    }
  })

  contextKit.on('modifierHoldReleased', () => {
    console.log('[modifier] Option hold released — stopping voice')
    stopVoiceRecording()
  })

  // Configure the monitor
  contextKit.configureModifierTapMonitor({
    modifier: 'option',
    requiredTaps: 2,
    tapInterval: 0.4,
    maxHoldDuration: 0.3
  }).catch((err) => {
    console.warn('[modifier] Failed to configure tap monitor:', err.message)
  })
}

// ── Voice recording ──────────────────────────────────────

async function startVoiceRecording(): Promise<void> {
  if (!contextKit || voiceRecordingActive) return
  voiceRecordingActive = true

  try {
    await contextKit.startRecording()
    sendToAllRenderers('hummingbird:voiceRecording', { recording: true })
    console.log('[voice] Recording started')
  } catch (err) {
    console.error('[voice] Failed to start recording:', err)
    voiceRecordingActive = false
    sendToAllRenderers('hummingbird:voiceRecording', { recording: false })
  }
}

async function stopVoiceRecording(): Promise<void> {
  if (!contextKit || !voiceRecordingActive) return
  voiceRecordingActive = false

  try {
    const result = await contextKit.stopRecording()
    sendToAllRenderers('hummingbird:voiceRecording', { recording: false })
    console.log(`[voice] Recording stopped — ${result.durationSeconds}s`)

    // Transcribe via Whisper
    const audioPath = result.combinedAudioPath || result.micAudioPath
    if (audioPath && result.durationSeconds > 0.5) {
      const transcript = await transcribeAudio(audioPath)
      if (transcript) {
        console.log(`[voice] Transcript: "${transcript.slice(0, 80)}"`)
        sendToAllRenderers('hummingbird:voiceTranscript', { text: transcript })
      }
    }
  } catch (err) {
    console.error('[voice] Failed to stop recording:', err)
    sendToAllRenderers('hummingbird:voiceRecording', { recording: false })
  }
}

async function transcribeAudio(audioPath: string): Promise<string | null> {
  // Get OpenAI API key from settings
  const apiKey = getSetting('openai_api_key') as string | null
  if (!apiKey) {
    console.warn('[voice] No OpenAI API key set — cannot transcribe')
    return null
  }

  try {
    const audioData = fs.readFileSync(audioPath)
    const formData = new FormData()
    formData.append('file', new Blob([audioData], { type: 'audio/wav' }), 'recording.wav')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'text')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      console.error('[voice] Whisper API error:', response.status, await response.text())
      return null
    }

    const text = await response.text()
    return text.trim()
  } catch (err) {
    console.error('[voice] Transcription failed:', err)
    return null
  }
}

// ── System tray ──────────────────────────────────────────

function setupTray(): void {
  // Create a small template icon for the menu bar
  // Using a 16x16 template image (macOS auto-handles dark/light)
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(app.getAppPath(), 'resources', 'tray-icon.png')

  let icon: Electron.NativeImage
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
    icon.setTemplateImage(true)
  } else {
    // Fallback: create a tiny bird-like icon programmatically
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Kestrel')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Kestrel',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: 'Quick Chat',
      accelerator: 'Option+Option',
      click: () => {
        if (hummingbirdWindow) toggleHummingbird(hummingbirdWindow)
      }
    },
    { type: 'separator' },
    {
      label: 'New Chat',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('app:newChat', {})
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Hide Dock Icon',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        if (menuItem.checked) {
          app.dock?.hide()
        } else {
          app.dock?.show()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Kestrel',
      accelerator: 'CmdOrCtrl+Q',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)

  // Click tray icon → toggle main window
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}
