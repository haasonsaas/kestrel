/**
 * Kestrel AI Quality Eval Suite v2
 *
 * Run: OPENROUTER_KEY=sk-or-... node evals/eval-runner.mjs
 */

const API_KEY = process.env.OPENROUTER_KEY
if (!API_KEY) {
  console.error('Set OPENROUTER_KEY env var: OPENROUTER_KEY=sk-or-... node evals/eval-runner.mjs')
  process.exit(1)
}

const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'

const MODELS = [
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5.4',
  'google/gemini-3.1-pro-preview',
]

function buildSystemPrompt(tc) {
  const base = `You are Kestrel, a context-aware AI assistant running as a macOS desktop app. You can see the user's active application, window title, browser URL, and visible screen content.

Core rules:
- ALWAYS reference the screen context when answering. Never ask the user to paste or describe what's on their screen — you already have it.
- Be concise. Lead with the answer, not the reasoning. One paragraph is usually enough.
- When you see code or errors, jump straight to the fix. Don't explain what the error means unless asked.
- When you see a browser page, reference the URL and page content directly.
- Adapt your tone to the app: technical and precise for terminals/IDEs, conversational for chat apps, professional for documents.

App-specific behavior:
- Terminal (Ghostty, iTerm, Terminal): You can see command output, errors, and logs. Reference specific lines, error codes, and file paths. Suggest commands.
- IDE (VS Code, Xcode, Cursor): You can see the active file and code. Reference functions, variables, and line numbers. Offer code fixes inline.
- Browser (Chrome, Safari, Arc): You can see the URL and page content. Reference the specific page, article, or PR.
- Slack/Messages: You can see the conversation. Help draft replies, summarize threads, or answer questions about the discussion.
- Email (Gmail): You can see the email thread. Help draft responses, extract action items, or summarize.
- Documents (Notion, Google Docs): You can see the document content. Help edit, summarize, or restructure.

Never say "I can see you're using X" as your entire response. Always add value beyond just identifying the app.`

  let prompt = base
  if (tc.context) {
    const ctx = tc.context
    const parts = ['<active_context>', `App: ${ctx.appName}`]
    if (ctx.windowTitle) parts.push(`Window: ${ctx.windowTitle}`)
    if (ctx.url) parts.push(`URL: ${ctx.url}`)
    if (ctx.visibleText?.length > 0) parts.push(`\nVisible content:\n${ctx.visibleText.join('\n')}`)
    parts.push('</active_context>')
    prompt += `\n\nThe user's current screen context is:\n${parts.join('\n')}`
    if (tc.hasVisibleText === false) {
      prompt += `\n\nIMPORTANT: You can only see the app name (${ctx.appName}), NOT the screen content. Tell the user to go to System Settings → Privacy & Security → Accessibility and enable Kestrel.`
    }
  } else {
    prompt += `\n\nIMPORTANT: Screen context is unavailable. Tell the user to enable Accessibility for Kestrel in System Settings.`
  }
  return prompt
}

const EVAL_CASES = [
  // ═══ TERMINAL ═══
  { id: 'term-1', category: 'terminal', name: 'Fix TypeScript build error',
    context: { appName: 'Ghostty', windowTitle: 'npm run build', visibleText: [
      '> tsc && vite build', 'src/components/UserCard.tsx:28:5',
      "error TS2322: Type 'string' is not assignable to type 'number'.",
      "  28 |   age: user.age.toString(),", "     |   ~~~",
      "  The expected type comes from property 'age' in type 'UserProfile'",
      'Found 1 error in src/components/UserCard.tsx:28'
    ]}, userMessage: 'fix this',
    criteria: [
      { name: 'mentions_file', check: r => /UserCard\.tsx/i.test(r), weight: 2 },
      { name: 'identifies_issue', check: r => /toString|string.*number|remove.*toString/i.test(r), weight: 3 },
      { name: 'gives_fix', check: r => /user\.age(?!\.)|\bremove\b|just.*age|parseInt/i.test(r), weight: 3 },
      { name: 'no_paste', check: r => !/paste|share|show me/i.test(r), weight: 2 },
      { name: 'concise', check: r => r.split(' ').length < 120, weight: 1 },
    ]},
  { id: 'term-2', category: 'terminal', name: 'Git status advice',
    context: { appName: 'Ghostty', windowTitle: 'git status', visibleText: [
      'On branch feature/auth-flow', 'Changes not staged for commit:',
      '  modified:   src/auth/login.ts', '  modified:   src/auth/middleware.ts',
      'Untracked files:', '  src/auth/oauth.ts', '  src/auth/types.ts'
    ]}, userMessage: 'what should I commit?',
    criteria: [
      { name: 'mentions_branch', check: r => /auth-flow|feature/i.test(r), weight: 1 },
      { name: 'mentions_files', check: r => /login\.ts|middleware\.ts|oauth\.ts|types\.ts/i.test(r), weight: 2 },
      { name: 'suggests_add', check: r => /git add|stage/i.test(r), weight: 2 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 2 },
    ]},
  { id: 'term-3', category: 'terminal', name: 'Docker crash diagnosis',
    context: { appName: 'Ghostty', windowTitle: 'docker logs api', visibleText: [
      'api  | Error: connect ECONNREFUSED 127.0.0.1:5432',
      'api  | Error: PostgreSQL connection refused',
      'api  | Retrying in 5s... (attempt 3/5)', 'api  | Process exited with code 1'
    ]}, userMessage: 'why is this failing',
    criteria: [
      { name: 'identifies_postgres', check: r => /postgres|database|5432/i.test(r), weight: 3 },
      { name: 'connection_refused', check: r => /not running|down|can.t connect|refused/i.test(r), weight: 2 },
      { name: 'suggests_fix', check: r => /docker.*compose|start.*postgres|check.*running/i.test(r), weight: 3 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 2 },
    ]},

  // ═══ IDE ═══
  { id: 'ide-1', category: 'ide', name: 'Spot SQL injection',
    context: { appName: 'Code', windowTitle: 'api.ts - backend', visibleText: [
      'async function getUser(req: Request, res: Response) {',
      '  const userId = req.params.id',
      '  const user = await db.query("SELECT * FROM users WHERE id = " + userId)',
      '  return res.json(user)', '}'
    ]}, userMessage: 'anything wrong with this?',
    criteria: [
      { name: 'sql_injection', check: r => /sql injection|injection|parameterized|prepared/i.test(r), weight: 4 },
      { name: 'suggests_fix', check: r => /\$1|\?|placeholder|parameterized/i.test(r), weight: 3 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 2 },
    ]},
  { id: 'ide-2', category: 'ide', name: 'Explain queue worker code',
    context: { appName: 'Code', windowTitle: 'worker.ts', visibleText: [
      'const worker = new Worker("email-queue", async (job) => {',
      '  const { to, subject, body } = job.data',
      '  await transporter.sendMail({ from: config.FROM, to, subject, html: body })',
      '  await db.update(emails).set({ sentAt: new Date() }).where(eq(emails.id, job.data.emailId))',
      '}, { connection: redis, concurrency: 5 })',
    ]}, userMessage: 'what does this do?',
    criteria: [
      { name: 'explains_queue', check: r => /worker|queue|process|job/i.test(r), weight: 2 },
      { name: 'explains_email', check: r => /email|send|mail/i.test(r), weight: 2 },
      { name: 'explains_concurrency', check: r => /concurrency|5|parallel/i.test(r), weight: 1 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 2 },
      { name: 'concise', check: r => r.split(' ').length < 150, weight: 1 },
    ]},

  // ═══ BROWSER ═══
  { id: 'browser-1', category: 'browser', name: 'GitHub PR summary',
    context: { appName: 'Google Chrome',
      windowTitle: 'Add rate limiting by sarah · PR #187', url: 'https://github.com/acme/api/pull/187',
      visibleText: ['Files changed: 4', '+ const limiter = rateLimit({ windowMs: 15*60*1000, max: 100 })',
        '+ app.use("/api/", limiter)', 'Review: Changes requested by @mike - "Different limits per endpoint?"']
    }, userMessage: 'summarize this PR',
    criteria: [
      { name: 'mentions_rate_limiting', check: r => /rate limit/i.test(r), weight: 2 },
      { name: 'mentions_config', check: r => /100.*request|15.*minute/i.test(r), weight: 1 },
      { name: 'mentions_feedback', check: r => /mike|different.*limit|per.*endpoint|changes.*requested/i.test(r), weight: 3 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 2 },
    ]},
  { id: 'browser-2', category: 'browser', name: 'React docs question',
    context: { appName: 'Google Chrome', windowTitle: 'useEffect – React',
      url: 'https://react.dev/reference/react/useEffect', visibleText: [
        'useEffect(setup, dependencies?)', 'setup: The function with your Effect logic.',
        'dependencies: The list of all reactive values referenced inside the setup code.',
        'Caveats: objects or functions defined inside the component may cause re-runs.'
    ]}, userMessage: 'when should I use this vs useMemo?',
    criteria: [
      { name: 'side_effects', check: r => /side effect|fetch|subscri|cleanup|DOM/i.test(r), weight: 3 },
      { name: 'computation', check: r => /comput|memoiz|cached|expensive|deriv/i.test(r), weight: 2 },
      { name: 'references_docs', check: r => /depend|reactive|re-run/i.test(r), weight: 1 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 1 },
    ]},

  // ═══ SLACK ═══
  { id: 'slack-1', category: 'slack', name: 'Draft Slack reply',
    context: { appName: 'Slack', windowTitle: 'Slack | #engineering', visibleText: [
      '@alice: Deploy to staging failed. Getting a 502 on the health check.',
      '@bob: Looks like the new auth middleware is crashing on startup.',
      '@alice: Can someone look at it? I need staging for the demo tomorrow.',
      '@charlie: I can take a look. Is it the PR from yesterday?',
      '@alice: Yes, PR #42 merged last night.'
    ]}, userMessage: "help me reply that I'll investigate",
    criteria: [
      { name: 'draft_reply', check: r => /I.ll|look into|investigate|check|on it/i.test(r), weight: 3 },
      { name: 'references_context', check: r => /502|staging|auth|middleware|PR.*42/i.test(r), weight: 3 },
      { name: 'casual_tone', check: r => !/Dear|Regarding|pursuant/i.test(r), weight: 1 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 1 },
    ]},

  // ═══ SYSTEM PROMPT ═══
  { id: 'sys-1', category: 'system', name: 'Identifies as Kestrel', context: null,
    userMessage: 'What are you?',
    criteria: [
      { name: 'says_kestrel', check: r => /kestrel/i.test(r), weight: 3 },
      { name: 'not_chatgpt', check: r => !/ChatGPT|GPT|OpenAI|Claude|Anthropic/i.test(r), weight: 2 },
    ]},
  { id: 'sys-2', category: 'system', name: 'Accessibility hint',
    context: { appName: 'Ghostty', windowTitle: null, visibleText: null }, hasVisibleText: false,
    userMessage: 'What do you see on my screen?',
    criteria: [
      { name: 'mentions_settings', check: r => /system settings|privacy|accessibility/i.test(r), weight: 3 },
      { name: 'mentions_kestrel', check: r => /kestrel/i.test(r), weight: 2 },
      { name: 'no_paste', check: r => !/paste|describe/i.test(r), weight: 2 },
    ]},
  { id: 'sys-3', category: 'system', name: 'Adds value beyond app name',
    context: { appName: 'Google Chrome', windowTitle: 'YouTube - How to Cook Pasta',
      url: 'https://youtube.com/watch?v=abc123', visibleText: [
        'How to Cook Perfect Pasta', '1.2M views', 'Chef Marco', 'Step 1: Boil water with salt'
    ]}, userMessage: 'what am I looking at?',
    criteria: [
      { name: 'mentions_topic', check: r => /pasta|cook/i.test(r), weight: 2 },
      { name: 'adds_detail', check: r => /Chef Marco|step|boil|salt|recipe|views/i.test(r), weight: 2 },
      { name: 'not_just_app', check: r => r.split(' ').length > 15, weight: 2 },
      { name: 'no_paste', check: r => !/paste|share/i.test(r), weight: 2 },
    ]},

  // ═══ NO CONTEXT ═══
  { id: 'null-1', category: 'no-context', name: 'Null context handled', context: null,
    userMessage: "What's on my screen right now?",
    criteria: [
      { name: 'mentions_settings', check: r => /system settings|privacy|accessibility/i.test(r), weight: 3 },
      { name: 'not_hallucinate', check: r => !/I can see|you.re (using|looking|working)/i.test(r), weight: 3 },
    ]},
]

async function callModel(model, systemPrompt, userMessage) {
  const start = Date.now()
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://kestrel.app', 'X-Title': 'Kestrel Evals' },
      body: JSON.stringify({ model, messages: [
        { role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }
      ], max_tokens: 500, temperature: 0 })
    })
    if (!res.ok) return { content: `[ERROR ${res.status}]`, latencyMs: Date.now() - start, error: true }
    const data = await res.json()
    return { content: data.choices?.[0]?.message?.content || '[EMPTY]', latencyMs: Date.now() - start, error: false }
  } catch (e) { return { content: `[${e.message}]`, latencyMs: Date.now() - start, error: true } }
}

function score(response, criteria) {
  let total = 0, earned = 0
  const details = []
  for (const c of criteria) {
    total += c.weight
    const passed = c.check(response)
    if (passed) earned += c.weight
    details.push({ name: c.name, passed, weight: c.weight })
  }
  return { score: total > 0 ? earned / total : 0, details }
}

async function main() {
  console.log('\n🦅 Kestrel AI Quality Eval Suite v2\n')
  console.log(`Models: ${MODELS.join(', ')}`)
  console.log(`Tests: ${EVAL_CASES.length}\n${'─'.repeat(70)}\n`)

  const results = []
  for (const tc of EVAL_CASES) {
    console.log(`\n📋 ${tc.id}: ${tc.name}`)
    console.log(`   ${tc.category} | "${tc.userMessage}"`)
    const sp = buildSystemPrompt(tc)
    const mr = []
    for (const model of MODELS) {
      const ms = model.split('/').pop()
      process.stdout.write(`   ${ms.padEnd(25)}`)
      const res = await callModel(model, sp, tc.userMessage)
      if (res.error) { console.log(`❌ ${res.content}`); mr.push({ model, ms, score: 0, error: true }); continue }
      const s = score(res.content, tc.criteria)
      const pct = (s.score * 100).toFixed(0)
      const bar = '█'.repeat(Math.round(s.score * 10)) + '░'.repeat(10 - Math.round(s.score * 10))
      const fails = s.details.filter(d => !d.passed).map(d => d.name)
      console.log(`${bar} ${pct}%  ${res.latencyMs}ms${fails.length ? ` [MISS: ${fails.join(', ')}]` : ''}`)
      mr.push({ model, ms, score: s.score, latencyMs: res.latencyMs, details: s.details, response: res.content, error: false })
    }
    results.push({ tc, mr })
  }

  console.log(`\n${'═'.repeat(70)}\n📊 RESULTS\n`)
  const agg = {}
  for (const r of results) for (const m of r.mr) {
    if (m.error) continue
    if (!agg[m.ms]) agg[m.ms] = { t: 0, c: 0, l: 0 }
    agg[m.ms].t += m.score; agg[m.ms].c++; agg[m.ms].l += m.latencyMs
  }
  console.log('Leaderboard:')
  Object.entries(agg).map(([m, a]) => ({ m, avg: a.t / a.c, lat: Math.round(a.l / a.c) }))
    .sort((a, b) => b.avg - a.avg)
    .forEach(e => {
      const bar = '█'.repeat(Math.round(e.avg * 10)) + '░'.repeat(10 - Math.round(e.avg * 10))
      console.log(`  ${e.m.padEnd(28)} ${bar} ${(e.avg * 100).toFixed(1)}%  ${e.lat}ms`)
    })

  console.log('\nBy Category:')
  const cats = [...new Set(EVAL_CASES.map(c => c.category))]
  for (const cat of cats) {
    const scores = results.filter(r => r.tc.category === cat)
      .flatMap(r => r.mr.filter(m => !m.error).map(m => m.score))
    if (scores.length) console.log(`  ${cat.padEnd(20)} ${(scores.reduce((a,b)=>a+b,0)/scores.length*100).toFixed(0)}%`)
  }

  console.log('\nWorst:')
  results.flatMap(r => r.mr.filter(m => !m.error).map(m => ({ t: r.tc.id, m: m.ms, s: m.score })))
    .sort((a,b) => a.s - b.s).slice(0, 5)
    .forEach(s => console.log(`  ${s.t} + ${s.m}: ${(s.s*100).toFixed(0)}%`))

  console.log(`\n${'═'.repeat(70)}\n`)
}

main().catch(console.error)
