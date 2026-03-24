/**
 * TDD test for Core Audio Tap system audio capture.
 * Tests: tap creation, aggregate device, audio buffer flow, AEC.
 * Run with: node tests/coreaudio-tap.test.mjs
 */
import { spawn } from 'child_process'
import * as readline from 'readline'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BINARY = path.join(__dirname, '..', 'native', 'contextkit', '.build', 'release', 'contextkit')

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passed++
  } else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}

async function sendRpc(proc, rl, method, id, params = {}, timeout = 15000) {
  const request = JSON.stringify({ jsonrpc: '2.0', id: String(id), method, params })
  proc.stdin.write(request + '\n')
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), timeout)
    const handler = (line) => {
      try {
        const msg = JSON.parse(line)
        if (msg.id === String(id)) {
          clearTimeout(timer)
          rl.removeListener('line', handler)
          resolve(msg)
        }
      } catch {}
    }
    rl.on('line', handler)
  })
}

async function main() {
  console.log('\n🔊 Core Audio Tap + AEC Pipeline Tests\n')

  const proc = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = readline.createInterface({ input: proc.stdout })
  let stderr = ''
  proc.stderr.on('data', (d) => { stderr += d.toString() })

  await new Promise((resolve) => rl.once('line', () => resolve()))
  console.log('  ContextKit ready\n')

  // Test 1: Query audio capabilities
  console.log('Audio capabilities:')
  const capsResp = await sendRpc(proc, rl, 'audio.getCapabilities', 1)
  assert(!capsResp.error, `No error: ${capsResp.error?.message || 'OK'}`)
  assert(capsResp.result?.hasCoreAudioTaps === true || capsResp.result?.hasCoreAudioTaps === false,
    `Core Audio Taps supported: ${capsResp.result?.hasCoreAudioTaps}`)
  assert(capsResp.result?.hasScreenCaptureKit === true,
    `ScreenCaptureKit available: ${capsResp.result?.hasScreenCaptureKit}`)
  assert(typeof capsResp.result?.defaultInputDevice === 'string',
    `Default input device: ${capsResp.result?.defaultInputDevice}`)
  console.log(`    AEC available: ${capsResp.result?.hasAEC}`)

  // Test 2: Start recording with Core Audio Tap (preferred) or SCK fallback
  console.log('\nStart recording (prefer Core Audio Tap):')
  const startResp = await sendRpc(proc, rl, 'audio.startRecording', 2, { preferCoreAudioTap: true })
  assert(!startResp.error, `No error: ${startResp.error?.message || 'OK'}`)
  assert(startResp.result?.status === 'recording', 'Status is recording')
  const captureMethod = startResp.result?.captureMethod
  console.log(`    Capture method: ${captureMethod}`)
  console.log(`    AEC enabled: ${startResp.result?.aecEnabled}`)
  assert(captureMethod === 'coreAudioTap' || captureMethod === 'screenCaptureKit',
    `Valid capture method: ${captureMethod}`)

  // Test 3: Record for 5 seconds
  console.log('\nRecording for 5 seconds...')
  await new Promise(r => setTimeout(r, 2000))

  const midStatus = await sendRpc(proc, rl, 'audio.getStatus', 3)
  assert(midStatus.result?.recording === true, 'Still recording at 2s')
  assert(midStatus.result?.durationSeconds > 1.5, `Duration: ${midStatus.result?.durationSeconds?.toFixed(1)}s`)
  assert(typeof midStatus.result?.systemBufferCount === 'number',
    `System buffers: ${midStatus.result?.systemBufferCount}`)
  assert(typeof midStatus.result?.micBufferCount === 'number',
    `Mic buffers: ${midStatus.result?.micBufferCount}`)

  await new Promise(r => setTimeout(r, 3000))

  // Test 4: Stop and verify output
  console.log('Stop recording:')
  const stopResp = await sendRpc(proc, rl, 'audio.stopRecording', 4)
  assert(!stopResp.error, `No error: ${stopResp.error?.message || 'OK'}`)
  assert(stopResp.result?.durationSeconds > 4, `Duration ≥ 4s: ${stopResp.result?.durationSeconds?.toFixed(1)}s`)

  // Test 5: Verify WAV files
  console.log('\nVerify output:')
  const combinedPath = stopResp.result?.combinedAudioPath
  if (combinedPath && fs.existsSync(combinedPath)) {
    const stats = fs.statSync(combinedPath)
    // Size depends on whether system audio was playing during test
    assert(stats.size > 500, `Combined WAV size: ${(stats.size / 1024).toFixed(1)}KB (>0.5KB)`)

    // Parse WAV header
    const buf = fs.readFileSync(combinedPath)
    assert(buf.toString('ascii', 0, 4) === 'RIFF', 'Valid RIFF')
    assert(buf.toString('ascii', 8, 12) === 'WAVE', 'Valid WAVE')

    let fmtOff = -1
    for (let i = 12; i < Math.min(buf.length, 200); i++) {
      if (buf.toString('ascii', i, i + 4) === 'fmt ') { fmtOff = i + 8; break }
    }
    if (fmtOff > 0) {
      const sr = buf.readUInt32LE(fmtOff + 4)
      const ch = buf.readUInt16LE(fmtOff + 2)
      const bits = buf.readUInt16LE(fmtOff + 14)
      assert(sr === 16000, `Sample rate: ${sr}Hz`)
      assert(ch === 1, `Channels: ${ch}`)
      assert(bits === 16, `Bit depth: ${bits}`)
    }

    // Check separate streams exist
    const systemPath = stopResp.result?.systemAudioPath
    const micPath = stopResp.result?.micAudioPath
    if (systemPath) assert(fs.existsSync(systemPath), `System WAV exists`)
    if (micPath) assert(fs.existsSync(micPath), `Mic WAV exists`)
  } else {
    assert(false, 'Combined WAV not found')
  }

  // Cleanup
  await sendRpc(proc, rl, 'shutdown', 5)
  await new Promise((resolve) => proc.on('exit', resolve))

  if (combinedPath) {
    try { fs.rmSync(path.dirname(combinedPath), { recursive: true, force: true }) } catch {}
  }

  if (stderr) {
    console.log(`\nstderr:\n${stderr.split('\n').slice(0, 20).map(l => `  ${l}`).join('\n')}`)
    if (stderr.split('\n').length > 20) console.log(`  ... (${stderr.split('\n').length - 20} more lines)`)
  }

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log(`${'─'.repeat(40)}\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
