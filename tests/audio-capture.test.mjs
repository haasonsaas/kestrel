/**
 * TDD test for audio capture pipeline.
 * Tests: start recording, verify files created, stop, verify WAV output.
 * Run with: node tests/audio-capture.test.mjs
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

async function sendRpc(proc, rl, method, id, timeout = 10000) {
  const request = JSON.stringify({ jsonrpc: '2.0', id: String(id), method })
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
  console.log('\n🎤 Audio Capture Pipeline Tests\n')

  const proc = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = readline.createInterface({ input: proc.stdout })

  let stderr = ''
  proc.stderr.on('data', (d) => { stderr += d.toString() })

  // Wait for ready
  await new Promise((resolve) => {
    rl.once('line', () => resolve())
  })
  console.log('  ContextKit ready\n')

  // Test 1: Start recording
  console.log('Start recording:')
  let startResp
  try {
    startResp = await sendRpc(proc, rl, 'audio.startRecording', 1, 15000)
    assert(!startResp.error, `No error: ${startResp.error?.message || 'OK'}`)
    assert(startResp.result?.status === 'recording', 'Status is "recording"')
    assert(typeof startResp.result?.combinedAudioPath === 'string', 'Got combined audio path')
    console.log(`    Path: ${startResp.result?.combinedAudioPath}`)
  } catch (err) {
    assert(false, `Start recording: ${err.message}`)
    // Still try to continue
  }

  // Test 2: Check status while recording
  console.log('\nCheck status:')
  await new Promise(r => setTimeout(r, 2000)) // Record for 2 seconds
  const statusResp = await sendRpc(proc, rl, 'audio.getStatus', 2)
  assert(!statusResp.error, 'No error from getStatus')
  assert(statusResp.result?.recording === true, 'Still recording')
  assert(statusResp.result?.durationSeconds > 0, `Duration: ${statusResp.result?.durationSeconds?.toFixed(1)}s`)

  // Test 3: Record for a few more seconds
  console.log('\nRecording for 3 more seconds...')
  await new Promise(r => setTimeout(r, 3000))

  // Test 4: Stop recording
  console.log('Stop recording:')
  const stopResp = await sendRpc(proc, rl, 'audio.stopRecording', 3)
  assert(!stopResp.error, `No error: ${stopResp.error?.message || 'OK'}`)
  assert(stopResp.result?.durationSeconds > 4, `Duration ≥ 4s: ${stopResp.result?.durationSeconds?.toFixed(1)}s`)

  // Test 5: Verify WAV files exist
  console.log('\nVerify output files:')
  const combinedPath = stopResp.result?.combinedAudioPath
  if (combinedPath) {
    assert(fs.existsSync(combinedPath), `Combined WAV exists: ${combinedPath}`)
    const stats = fs.statSync(combinedPath)
    assert(stats.size > 1000, `File has content: ${(stats.size / 1024).toFixed(1)}KB`)
    console.log(`    Size: ${(stats.size / 1024).toFixed(1)}KB`)

    // Check WAV header — find fmt chunk by scanning for 'fmt ' marker
    const headerBuf = fs.readFileSync(combinedPath)
    assert(headerBuf.toString('ascii', 0, 4) === 'RIFF', 'Valid RIFF header')
    assert(headerBuf.toString('ascii', 8, 12) === 'WAVE', 'Valid WAVE format')

    // Find 'fmt ' chunk
    let fmtOffset = -1
    for (let i = 12; i < Math.min(headerBuf.length, 200); i++) {
      if (headerBuf.toString('ascii', i, i + 4) === 'fmt ') {
        fmtOffset = i + 8 // skip 'fmt ' + chunk size (4 bytes)
        break
      }
    }
    if (fmtOffset > 0) {
      const channels = headerBuf.readUInt16LE(fmtOffset + 2)
      const sampleRate = headerBuf.readUInt32LE(fmtOffset + 4)
      const bitsPerSample = headerBuf.readUInt16LE(fmtOffset + 14)
      assert(sampleRate === 16000, `Sample rate: ${sampleRate}Hz (expected 16000)`)
      assert(channels === 1, `Channels: ${channels} (expected 1 mono)`)
      assert(bitsPerSample === 16, `Bit depth: ${bitsPerSample} (expected 16)`)
    } else {
      assert(false, 'Could not find fmt chunk in WAV')
    }
  } else {
    assert(false, 'No combined audio path returned')
  }

  // Test 6: Check not recording after stop
  console.log('\nPost-stop status:')
  const postStopResp = await sendRpc(proc, rl, 'audio.getStatus', 4)
  assert(postStopResp.result?.recording === false, 'Not recording after stop')

  // Shutdown
  await sendRpc(proc, rl, 'shutdown', 5)
  await new Promise((resolve) => proc.on('exit', resolve))

  if (stderr) {
    console.log(`\nstderr output:\n${stderr.split('\n').map(l => `  ${l}`).join('\n')}`)
  }

  // Cleanup temp files
  if (combinedPath) {
    const dir = path.dirname(combinedPath)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
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
