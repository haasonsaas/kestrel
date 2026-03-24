import { ipcMain, BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import fs from 'fs'
import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { transcribeAudio } from './transcriber'
import { summarizeMeeting } from './summarizer'
import type { ContextKitClient } from '../native/contextkit-client'
import type { MeetingStatus } from '../../shared/ipc'

let contextKitRef: ContextKitClient | null = null

let activeMeeting: {
  id: string
  title: string
  app: string
  startTime: number
  audioPaths: {
    systemAudioPath: string
    micAudioPath: string
    combinedAudioPath: string
  } | null
} | null = null

/** Check if a meeting is currently being recorded */
export function isRecording(): boolean {
  return activeMeeting !== null
}

/** Get the active meeting ID (if any) */
export function getActiveMeetingId(): string | null {
  return activeMeeting?.id ?? null
}

/** Programmatically start a meeting recording (used by auto-detect) */
export async function startMeetingRecording(title: string, app: string): Promise<string> {
  const db = getDatabase()
  const id = uuid()
  const now = Date.now()

  activeMeeting = {
    id,
    title,
    app,
    startTime: now,
    audioPaths: null
  }

  db.insert(schema.meetings)
    .values({
      id,
      title,
      app,
      startedAt: new Date(now)
    })
    .run()

  if (contextKitRef) {
    try {
      const recordingInfo = await contextKitRef.startRecording()
      activeMeeting.audioPaths = {
        systemAudioPath: recordingInfo.systemAudioPath,
        micAudioPath: recordingInfo.micAudioPath,
        combinedAudioPath: recordingInfo.combinedAudioPath
      }
      console.log('[meeting] Audio recording started:', recordingInfo.combinedAudioPath)
    } catch (err) {
      console.error('[meeting] Failed to start audio recording:', err)
    }
  }

  return id
}

/** Programmatically stop a meeting recording (used by auto-detect) */
export async function stopMeetingRecording(id: string): Promise<void> {
  if (!activeMeeting || activeMeeting.id !== id) return

  const db = getDatabase()
  const now = Date.now()
  const meetingId = activeMeeting.id
  const meetingTitle = activeMeeting.title

  let combinedAudioPath: string | null = null
  if (contextKitRef) {
    try {
      const result = await contextKitRef.stopRecording()
      combinedAudioPath = result.combinedAudioPath
      console.log(`[meeting] Recording stopped. Duration: ${result.durationSeconds.toFixed(1)}s`)
    } catch (err) {
      console.error('[meeting] Failed to stop recording:', err)
    }
  }

  db.update(schema.meetings)
    .set({ endedAt: new Date(now) })
    .where(eq(schema.meetings.id, meetingId))
    .run()

  activeMeeting = null

  if (combinedAudioPath && fs.existsSync(combinedAudioPath)) {
    transcribeAndSummarize(meetingId, meetingTitle, combinedAudioPath).catch((err) => {
      console.error('[meeting] Transcription/summary failed:', err)
    })
  }
}

/** Send an IPC push event to all renderer windows */
function sendToAllRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

export function registerMeetingHandlers(contextKit?: ContextKitClient | null): void {
  if (contextKit) contextKitRef = contextKit

  ipcMain.handle('meeting:start', async () => {
    const id = await startMeetingRecording('Meeting', 'Manual Recording')
    return { id }
  })

  ipcMain.handle('meeting:stop', async (_e, id: string) => {
    await stopMeetingRecording(id)
  })

  ipcMain.handle('meeting:status', async (): Promise<MeetingStatus | null> => {
    if (!activeMeeting) return null

    // Get live duration from ContextKit if available
    let duration = Math.floor((Date.now() - activeMeeting.startTime) / 1000)
    if (contextKitRef) {
      try {
        const status = await contextKitRef.getAudioStatus()
        if (status.recording) {
          duration = Math.floor(status.durationSeconds)
        }
      } catch {
        // Fall back to local timer
      }
    }

    return {
      id: activeMeeting.id,
      active: true,
      title: activeMeeting.title,
      app: activeMeeting.app,
      duration,
      recording: activeMeeting.audioPaths !== null
    }
  })
}

async function transcribeAndSummarize(
  meetingId: string,
  title: string,
  audioPath: string
): Promise<void> {
  const db = getDatabase()

  console.log(`[meeting] Transcribing: ${audioPath}`)

  // Read the WAV file
  const audioBuffer = Buffer.from(fs.readFileSync(audioPath))
  const fileSizeKB = Math.round(audioBuffer.length / 1024)
  console.log(`[meeting] Audio file: ${fileSizeKB}KB`)

  // Whisper requires at least 0.1s of audio. At 16kHz mono 16-bit, that's ~3.2KB.
  // Add a sensible minimum of 10KB (~0.3s) to avoid API errors.
  if (audioBuffer.length < 10000) {
    console.warn(`[meeting] Audio too short (${fileSizeKB}KB) — skipping transcription`)
    db.update(schema.meetings)
      .set({ transcript: '[Recording too short for transcription]' })
      .where(eq(schema.meetings.id, meetingId))
      .run()
    return
  }

  // Transcribe via Whisper
  let transcript: string
  try {
    transcript = await transcribeAudio(audioBuffer)
    console.log(`[meeting] Transcript: ${transcript.length} chars`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[meeting] Transcription failed:', err)
    db.update(schema.meetings)
      .set({ transcript: `[Transcription failed: ${err}]` })
      .where(eq(schema.meetings.id, meetingId))
      .run()
    sendToAllRenderers('meeting:transcriptionFailed', {
      meetingId,
      error: `Transcription failed: ${errorMsg}`
    })
    return
  }

  // Save transcript
  db.update(schema.meetings)
    .set({ transcript })
    .where(eq(schema.meetings.id, meetingId))
    .run()

  // Generate summary
  if (transcript.length > 50) {
    try {
      const { summary } = await summarizeMeeting(transcript, title)
      db.update(schema.meetings)
        .set({ summary })
        .where(eq(schema.meetings.id, meetingId))
        .run()
      console.log(`[meeting] Summary generated: ${summary.length} chars`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[meeting] Summary failed:', err)
      sendToAllRenderers('meeting:transcriptionFailed', {
        meetingId,
        error: `Summary generation failed: ${errorMsg}`
      })
    }
  }

  // Clean up temp audio files
  try {
    const dir = audioPath.substring(0, audioPath.lastIndexOf('/'))
    fs.rmSync(dir, { recursive: true, force: true })
    console.log('[meeting] Cleaned up temp audio files')
  } catch {
    // ignore
  }
}
