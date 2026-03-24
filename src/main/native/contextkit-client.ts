import { spawn, ChildProcess } from 'child_process'
import * as readline from 'readline'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { AppContext, PermissionStatus } from '../../shared/ipc'

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | null
  result?: unknown
  error?: { code: number; message: string }
}

interface FrontmostAppInfo {
  name: string
  bundleId: string
  pid: number
  windowTitle?: string
}

export class ContextKitClient {
  private process: ChildProcess | null = null
  private rl: readline.Interface | null = null
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: NodeJS.Timeout
    }
  >()
  private nextId = 1
  private ready: Promise<void> | null = null
  private binaryPath: string

  constructor() {
    // Try multiple paths to find the binary
    const candidates = [
      // Production: inside app bundle Resources
      path.join(process.resourcesPath, 'contextkit'),
      // Dev: relative to project root via app.getAppPath()
      path.join(app.getAppPath(), 'native', 'contextkit', '.build', 'release', 'contextkit'),
      // Dev: electron-vite puts main in out/main, so go up 2 levels
      path.join(app.getAppPath(), '..', '..', 'native', 'contextkit', '.build', 'release', 'contextkit'),
      // Dev: relative to __dirname (out/main/)
      path.join(__dirname, '..', '..', 'native', 'contextkit', '.build', 'release', 'contextkit'),
      // Dev: CWD-based
      path.join(process.cwd(), 'native', 'contextkit', '.build', 'release', 'contextkit')
    ]

    this.binaryPath = ''
    for (const candidate of candidates) {
      const resolved = path.resolve(candidate)
      console.log(`[contextkit] checking path: ${resolved} — ${fs.existsSync(resolved) ? 'EXISTS' : 'not found'}`)
      if (fs.existsSync(resolved)) {
        this.binaryPath = resolved
        break
      }
    }

    if (!this.binaryPath) {
      console.error('[contextkit] Binary not found in any candidate path!')
      console.error('[contextkit] app.getAppPath():', app.getAppPath())
      console.error('[contextkit] __dirname:', __dirname)
      console.error('[contextkit] process.cwd():', process.cwd())
      console.error('[contextkit] process.resourcesPath:', process.resourcesPath)
    } else {
      console.log(`[contextkit] Using binary at: ${this.binaryPath}`)
    }
  }

  async start(): Promise<void> {
    if (this.process) return

    if (!this.binaryPath) {
      console.error('[contextkit] No binary path — cannot start. Run: npm run contextkit:build')
      return
    }

    // Ensure executable
    try {
      fs.chmodSync(this.binaryPath, 0o755)
    } catch {
      // ignore
    }

    console.log(`[contextkit] Spawning: ${this.binaryPath}`)
    this.process = spawn(this.binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.rl = readline.createInterface({ input: this.process.stdout! })

    // Wait for "ready" notification with timeout
    this.ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[contextkit] Ready timeout — no response from binary after 10s')
        reject(new Error('ContextKit startup timeout'))
      }, 10000)

      const onFirstLine = (line: string) => {
        clearTimeout(timeout)
        console.log('[contextkit] First response:', line.slice(0, 100))
        try {
          const msg: JsonRpcResponse = JSON.parse(line)
          if (!msg.id && msg.result) {
            resolve()
          }
        } catch {
          console.error('[contextkit] Failed to parse ready response:', line)
          resolve() // resolve anyway so we don't hang
        }
      }
      this.rl!.once('line', onFirstLine)
    })

    // Handle all subsequent lines
    this.rl.on('line', (line) => {
      try {
        const msg: JsonRpcResponse = JSON.parse(line)
        if (!msg.id) return // skip notifications
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        clearTimeout(p.timer)
        if (msg.error) {
          console.error(`[contextkit] RPC error for ${msg.id}:`, msg.error.message)
          p.reject(new Error(msg.error.message))
        } else {
          p.resolve(msg.result)
        }
      } catch {
        /* ignore malformed */
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.log('[contextkit:stderr]', data.toString().trim())
    })

    this.process.on('error', (err) => {
      console.error('[contextkit] Process spawn error:', err.message)
    })

    this.process.on('exit', (code, signal) => {
      console.log(`[contextkit] Process exited: code=${code} signal=${signal}`)
      this.process = null
      this.rl = null
    })

    try {
      await this.ready
      console.log('[contextkit] Connected and ready')
    } catch (err) {
      console.error('[contextkit] Start failed:', err)
    }
  }

  private async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error('ContextKit not running')
    }
    await this.ready

    const id = String(this.nextId++)
    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} })
    console.log(`[contextkit] → ${method} (id=${id})`)
    this.process.stdin.write(request + '\n')

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        console.error(`[contextkit] Timeout waiting for response to ${method} (id=${id})`)
        reject(new Error(`Timeout: ${method}`))
      }, 5000)
      this.pending.set(id, { resolve, reject, timer })
    })
  }

  async getContext(): Promise<AppContext | null> {
    try {
      const result = (await this.call('getContext')) as AppContext
      console.log(`[contextkit] Got context: ${result?.appName} — ${result?.windowTitle?.slice(0, 50)}`)
      return result
    } catch (err) {
      console.error('[contextkit] getContext failed:', err)
      return null
    }
  }

  async getFrontmostApp(): Promise<FrontmostAppInfo | null> {
    try {
      return (await this.call('getFrontmostApp')) as FrontmostAppInfo
    } catch (err) {
      console.error('[contextkit] getFrontmostApp failed:', err)
      return null
    }
  }

  async checkPermissions(): Promise<PermissionStatus> {
    try {
      const result = (await this.call('checkPermissions')) as { accessibility: boolean }
      console.log('[contextkit] Permissions:', JSON.stringify(result))
      return {
        accessibility: result.accessibility,
        screenRecording: false,
        microphone: false
      }
    } catch (err) {
      console.error('[contextkit] checkPermissions failed:', err)
      return { accessibility: false, screenRecording: false, microphone: false }
    }
  }

  // ── Meeting Detection by Mic Activity ──────────

  async detectMeetingByMic(): Promise<{
    meetingDetected: boolean
    micUsers: Array<{ bundleId: string; appName: string; pid: number }>
    meetingApp: string | null
  }> {
    try {
      return (await this.call('detectMeetingByMic')) as {
        meetingDetected: boolean
        micUsers: Array<{ bundleId: string; appName: string; pid: number }>
        meetingApp: string | null
      }
    } catch {
      return { meetingDetected: false, micUsers: [], meetingApp: null }
    }
  }

  // ── Audio Recording ────────────────────────────

  async startRecording(): Promise<{
    status: string
    systemAudioPath: string
    micAudioPath: string
    combinedAudioPath: string
  }> {
    const result = await this.call('audio.startRecording')
    console.log('[contextkit] Recording started:', JSON.stringify(result))
    return result as {
      status: string
      systemAudioPath: string
      micAudioPath: string
      combinedAudioPath: string
    }
  }

  async stopRecording(): Promise<{
    systemAudioPath: string
    micAudioPath: string
    combinedAudioPath: string
    durationSeconds: number
  }> {
    const result = await this.call('audio.stopRecording')
    console.log('[contextkit] Recording stopped:', JSON.stringify(result))
    return result as {
      systemAudioPath: string
      micAudioPath: string
      combinedAudioPath: string
      durationSeconds: number
    }
  }

  async getAudioStatus(): Promise<{ recording: boolean; durationSeconds: number }> {
    return (await this.call('audio.getStatus')) as {
      recording: boolean
      durationSeconds: number
    }
  }

  async shutdown(): Promise<void> {
    if (!this.process) return
    try {
      await this.call('shutdown')
    } catch {
      /* ignore */
    }
    this.destroy()
  }

  destroy(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Client destroyed'))
    }
    this.pending.clear()
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
  }
}
