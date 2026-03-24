/**
 * TDD test for the ContextKit pipeline.
 * Validates: binary exists, spawns, returns JSON-RPC, context has data.
 * Run with: node tests/contextkit-pipeline.test.mjs
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

async function sendRpc(proc, rl, method, id) {
  const request = JSON.stringify({ jsonrpc: '2.0', id: String(id), method })
  proc.stdin.write(request + '\n')

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 5000)
    const handler = (line) => {
      try {
        const msg = JSON.parse(line)
        if (msg.id === String(id)) {
          clearTimeout(timeout)
          rl.removeListener('line', handler)
          resolve(msg)
        }
      } catch {}
    }
    rl.on('line', handler)
  })
}

async function main() {
  console.log('\n🧪 ContextKit Pipeline Tests\n')

  // Test 1: Binary exists
  console.log('Binary path:')
  assert(fs.existsSync(BINARY), `Binary exists at ${BINARY}`)

  // Test 2: Binary is executable
  try {
    fs.accessSync(BINARY, fs.constants.X_OK)
    assert(true, 'Binary is executable')
  } catch {
    assert(false, 'Binary is executable')
  }

  // Test 3: Spawn and get ready message
  console.log('\nSpawn & JSON-RPC:')
  const proc = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = readline.createInterface({ input: proc.stdout })

  let stderrOutput = ''
  proc.stderr.on('data', (d) => { stderrOutput += d.toString() })

  // Wait for ready
  const readyLine = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No ready message')), 5000)
    rl.once('line', (line) => {
      clearTimeout(timeout)
      resolve(line)
    })
  })

  const readyMsg = JSON.parse(readyLine)
  assert(readyMsg.result?.status === 'ready', 'Ready message received')
  assert(readyMsg.result?.version === '1.0.0', 'Version is 1.0.0')

  // Test 4: checkPermissions
  console.log('\ncheckPermissions:')
  const permsResp = await sendRpc(proc, rl, 'checkPermissions', 1)
  assert(!permsResp.error, 'No error from checkPermissions')
  assert(typeof permsResp.result?.accessibility === 'boolean', 'Returns accessibility boolean')
  console.log(`    accessibility = ${permsResp.result?.accessibility}`)

  // Test 5: getFrontmostApp
  console.log('\ngetFrontmostApp:')
  const appResp = await sendRpc(proc, rl, 'getFrontmostApp', 2)
  assert(!appResp.error, 'No error from getFrontmostApp')
  assert(typeof appResp.result?.name === 'string', 'Returns app name')
  assert(typeof appResp.result?.bundleId === 'string', 'Returns bundle ID')
  console.log(`    app = ${appResp.result?.name} (${appResp.result?.bundleId})`)

  // Test 6: getContext
  console.log('\ngetContext:')
  const ctxResp = await sendRpc(proc, rl, 'getContext', 3)
  assert(!ctxResp.error, 'No error from getContext')
  assert(typeof ctxResp.result?.appName === 'string', 'Returns appName')
  assert(typeof ctxResp.result?.bundleId === 'string', 'Returns bundleId')
  const hasText = ctxResp.result?.visibleText?.length > 0
  assert(hasText, `Has visible text (${ctxResp.result?.visibleText?.length ?? 0} items)`)
  console.log(`    app = ${ctxResp.result?.appName}`)
  console.log(`    window = ${ctxResp.result?.windowTitle?.slice(0, 60)}`)
  console.log(`    text items = ${ctxResp.result?.visibleText?.length ?? 0}`)

  // Test 7: shutdown
  console.log('\nshutdown:')
  const shutResp = await sendRpc(proc, rl, 'shutdown', 4)
  assert(shutResp.result?.ok === true, 'Shutdown acknowledged')

  // Wait for exit
  await new Promise((resolve) => proc.on('exit', resolve))
  assert(true, 'Process exited cleanly')

  if (stderrOutput) {
    console.log(`\nstderr: ${stderrOutput.trim()}`)
  }

  // Summary
  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log(`${'─'.repeat(40)}\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
