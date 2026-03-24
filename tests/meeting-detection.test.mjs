/**
 * TDD test for meeting detection via CoreAudio mic activity.
 * Run with: node tests/meeting-detection.test.mjs
 */
import { spawn } from 'child_process'
import * as readline from 'readline'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BINARY = path.join(__dirname, '..', 'native', 'contextkit', '.build', 'release', 'contextkit')

let passed = 0, failed = 0
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++ }
  else { console.error(`  ✗ ${msg}`); failed++ }
}

async function rpc(proc, rl, method, id, timeout = 5000) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: String(id), method }) + '\n')
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${method}`)), timeout)
    const h = (line) => {
      try { const m = JSON.parse(line); if (m.id === String(id)) { clearTimeout(t); rl.removeListener('line', h); resolve(m) } } catch {}
    }
    rl.on('line', h)
  })
}

async function main() {
  console.log('\n🎯 Meeting Detection via Mic Activity Tests\n')

  const proc = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = readline.createInterface({ input: proc.stdout })
  await new Promise(r => rl.once('line', () => r()))

  // Test 1: detectMeetingByMic returns valid structure
  console.log('Detection structure:')
  const det = await rpc(proc, rl, 'detectMeetingByMic', 1)
  assert(!det.error, `No error: ${det.error?.message || 'OK'}`)
  assert(typeof det.result?.meetingDetected === 'boolean', `meetingDetected is boolean: ${det.result?.meetingDetected}`)
  assert(Array.isArray(det.result?.micUsers), `micUsers is array: ${det.result?.micUsers?.length} items`)

  // Test 2: Each mic user has required fields
  console.log('\nMic users:')
  const users = det.result?.micUsers ?? []
  for (const user of users) {
    console.log(`  → ${user.appName} (${user.bundleId}) pid=${user.pid}`)
    assert(typeof user.bundleId === 'string', `Has bundleId: ${user.bundleId}`)
    assert(typeof user.appName === 'string', `Has appName: ${user.appName}`)
    assert(typeof user.pid === 'number', `Has pid: ${user.pid}`)
  }
  if (users.length === 0) {
    console.log('  (no processes using mic right now)')
    assert(true, 'Empty mic users is valid when no meeting active')
  }

  // Test 3: meetingApp is string or null
  console.log('\nMeeting app:')
  const app = det.result?.meetingApp
  assert(app === null || app === undefined || typeof app === 'string', `meetingApp is string|null|undefined: ${app}`)
  console.log(`  Meeting detected: ${det.result?.meetingDetected}`)
  console.log(`  Meeting app: ${app ?? '(none)'}`)

  // Test 4: Rapid polling doesn't crash
  console.log('\nRapid polling (10 calls):')
  const results = []
  for (let i = 0; i < 10; i++) {
    const r = await rpc(proc, rl, 'detectMeetingByMic', 10 + i)
    results.push(r.result)
  }
  assert(results.every(r => typeof r?.meetingDetected === 'boolean'), 'All 10 polls returned valid results')
  assert(results.every(r => r?.meetingDetected === results[0]?.meetingDetected), 'Consistent detection across polls')

  // Test 5: Our own process (contextkit) is not in mic users
  console.log('\nSelf-exclusion:')
  const hasSelf = users.some(u => u.bundleId.includes('kestrel') || u.bundleId.includes('contextkit'))
  assert(!hasSelf, 'Own process excluded from mic users')

  await rpc(proc, rl, 'shutdown', 99)
  await new Promise(r => proc.on('exit', r))

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log(`${'─'.repeat(40)}\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
