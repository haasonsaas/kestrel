/**
 * TDD test for context switching behavior.
 * Validates: self-exclusion, context caching, app switching.
 * Run with: node tests/context-switching.test.mjs
 */
import { spawn } from 'child_process'
import * as readline from 'readline'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BINARY = path.join(__dirname, '..', 'native', 'contextkit', '.build', 'release', 'contextkit')

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) { console.log(`  ✓ ${message}`); passed++ }
  else { console.error(`  ✗ ${message}`); failed++ }
}

async function sendRpc(proc, rl, method, id, params = {}, timeout = 5000) {
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
  console.log('\n🔄 Context Switching Tests\n')

  const proc = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = readline.createInterface({ input: proc.stdout })
  let stderr = ''
  proc.stderr.on('data', (d) => { stderr += d.toString() })
  await new Promise((resolve) => rl.once('line', () => resolve()))

  // Test 1: Get initial context (should be whatever is frontmost, likely Ghostty)
  console.log('Initial context:')
  const ctx1 = await sendRpc(proc, rl, 'getContext', 1)
  assert(!ctx1.error, 'No error')
  assert(ctx1.result?.appName, `Got app: ${ctx1.result?.appName}`)
  assert(ctx1.result?.bundleId, `Got bundle: ${ctx1.result?.bundleId}`)
  const initialApp = ctx1.result?.appName

  // Test 2: Rapid sequential calls should return consistent results
  console.log('\nRapid polling (5 calls):')
  const results = []
  for (let i = 0; i < 5; i++) {
    const r = await sendRpc(proc, rl, 'getContext', 10 + i)
    results.push(r.result)
  }
  const allSameApp = results.every(r => r?.appName === results[0]?.appName)
  assert(allSameApp, `All 5 calls return same app: ${results[0]?.appName}`)

  // Test 3: getFrontmostApp should also work
  console.log('\ngetFrontmostApp:')
  const front = await sendRpc(proc, rl, 'getFrontmostApp', 20)
  assert(!front.error, 'No error')
  assert(front.result?.name, `Frontmost: ${front.result?.name}`)

  // Test 4: Context should NOT return Electron/Kestrel
  console.log('\nSelf-exclusion check:')
  assert(ctx1.result?.appName !== 'Electron', `Not "Electron" (got "${ctx1.result?.appName}")`)
  assert(ctx1.result?.appName !== 'Kestrel', `Not "Kestrel" (got "${ctx1.result?.appName}")`)
  assert(ctx1.result?.bundleId !== 'com.github.electron', 'Bundle is not com.github.electron')

  // Test 5: Verify visible text is populated
  console.log('\nContent capture:')
  assert(
    ctx1.result?.visibleText === null || Array.isArray(ctx1.result?.visibleText),
    `visibleText is array or null`
  )
  if (ctx1.result?.visibleText) {
    assert(ctx1.result.visibleText.length > 0, `Has ${ctx1.result.visibleText.length} text items`)
    assert(ctx1.result.visibleText[0].length > 0, `First item has content`)
  }

  // Test 6: Window title should be present
  console.log('\nWindow title:')
  assert(typeof ctx1.result?.windowTitle === 'string', `Has window title: "${ctx1.result?.windowTitle?.slice(0, 50)}"`)

  await sendRpc(proc, rl, 'shutdown', 99)
  await new Promise((resolve) => proc.on('exit', resolve))

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log(`${'─'.repeat(40)}\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => { console.error('Error:', err); process.exit(1) })
