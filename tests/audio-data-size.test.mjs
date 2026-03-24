/**
 * TDD: Validate that recording produces substantial audio data.
 * At 16kHz mono 16-bit, 5 seconds = ~160KB.
 * This test FAILS if the audio pipeline drops buffers.
 */
import { spawn } from 'child_process'
import * as readline from 'readline'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BINARY = path.join(__dirname, '..', 'native', 'contextkit', '.build', 'release', 'contextkit')

let passed = 0, failed = 0
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++ }
  else { console.error(`  ✗ ${msg}`); failed++ }
}

async function rpc(proc, rl, method, id, params = {}, timeout = 15000) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: String(id), method, params }) + '\n')
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${method}`)), timeout)
    const h = (line) => {
      try { const m = JSON.parse(line); if (m.id === String(id)) { clearTimeout(t); rl.removeListener('line', h); resolve(m) } } catch {}
    }
    rl.on('line', h)
  })
}

async function main() {
  console.log('\n📊 Audio Data Size Validation\n')

  const proc = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = readline.createInterface({ input: proc.stdout })
  let stderr = ''
  proc.stderr.on('data', (d) => { stderr += d.toString() })
  await new Promise(r => rl.once('line', () => r()))

  // Record for 5 seconds
  console.log('Recording 5 seconds of audio...')
  const start = await rpc(proc, rl, 'audio.startRecording', 1)
  assert(!start.error, `Started: ${start.error?.message || 'OK'}`)
  console.log(`  Capture: ${start.result?.captureMethod}`)

  await new Promise(r => setTimeout(r, 5000))

  // Check buffer counts mid-recording
  const mid = await rpc(proc, rl, 'audio.getStatus', 2)
  const sysBufs = mid.result?.systemBufferCount ?? 0
  const micBufs = mid.result?.micBufferCount ?? 0
  console.log(`  System buffers: ${sysBufs}, Mic buffers: ${micBufs}`)
  assert(micBufs > 10, `Mic delivered >10 buffers (got ${micBufs})`)

  // Stop
  const stop = await rpc(proc, rl, 'audio.stopRecording', 3)
  assert(!stop.error, 'Stopped OK')

  // Validate file sizes
  console.log('\nFile sizes:')
  const combined = stop.result?.combinedAudioPath
  const system = stop.result?.systemAudioPath
  const mic = stop.result?.micAudioPath

  for (const [label, p] of [['Combined', combined], ['System', system], ['Mic', mic]]) {
    if (p && fs.existsSync(p)) {
      const size = fs.statSync(p).size
      const kb = (size / 1024).toFixed(1)
      console.log(`  ${label}: ${kb}KB`)

      if (label === 'Mic') {
        // 5 seconds at 16kHz mono 16-bit = 160KB. Allow 50% margin.
        assert(size > 50000, `Mic WAV > 50KB (got ${kb}KB) — has real audio data`)
      }
      if (label === 'Combined') {
        assert(size > 50000, `Combined WAV > 50KB (got ${kb}KB)`)
      }
    } else {
      console.log(`  ${label}: NOT FOUND`)
      if (label === 'Mic') assert(false, 'Mic WAV file missing')
    }
  }

  // Parse WAV to verify duration
  if (combined && fs.existsSync(combined)) {
    const buf = fs.readFileSync(combined)
    let fmtOff = -1
    for (let i = 12; i < Math.min(buf.length, 200); i++) {
      if (buf.toString('ascii', i, i + 4) === 'fmt ') { fmtOff = i + 8; break }
    }
    if (fmtOff > 0) {
      const sr = buf.readUInt32LE(fmtOff + 4)
      const ch = buf.readUInt16LE(fmtOff + 2)
      const bits = buf.readUInt16LE(fmtOff + 14)
      // Find data chunk
      let dataSize = 0
      for (let i = fmtOff; i < Math.min(buf.length, 1000); i++) {
        if (buf.toString('ascii', i, i + 4) === 'data') { dataSize = buf.readUInt32LE(i + 4); break }
      }
      const durationSec = dataSize / (sr * ch * (bits / 8))
      console.log(`\n  WAV duration: ${durationSec.toFixed(1)}s (${sr}Hz, ${ch}ch, ${bits}bit)`)
      assert(durationSec > 3, `Duration > 3s (got ${durationSec.toFixed(1)}s)`)
    }
  }

  // Cleanup
  await rpc(proc, rl, 'shutdown', 99)
  await new Promise(r => proc.on('exit', r))
  if (combined) try { fs.rmSync(path.dirname(combined), { recursive: true, force: true }) } catch {}

  if (stderr) console.log(`\nstderr:\n${stderr.split('\n').slice(0, 10).map(l => `  ${l}`).join('\n')}`)

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log(`${'─'.repeat(40)}\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
