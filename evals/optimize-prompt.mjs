/**
 * Kestrel System Prompt Optimizer using Ax + GEPA + LLM-as-Judge
 *
 * Optimizes the system prompt across two competing objectives:
 * 1. Context Quality — does the AI use screen context effectively?
 * 2. Conciseness — is the response brief and actionable?
 *
 * Uses LLM-as-judge (Claude Sonnet) to score responses on a 0-1 scale.
 *
 * Run: OPENROUTER_KEY=sk-or-... node evals/optimize-prompt.mjs
 */

import { AxAI, AxMiPRO } from '@ax-llm/ax'

const API_KEY = process.env.OPENROUTER_KEY
if (!API_KEY) {
  console.error('Set OPENROUTER_KEY env var')
  process.exit(1)
}

// ── LLM Setup ──

const studentAI = new AxAI({
  name: 'openrouter',
  apiKey: API_KEY,
  config: { model: 'anthropic/claude-sonnet-4.6' },
  options: { debug: false }
})

const teacherAI = new AxAI({
  name: 'openrouter',
  apiKey: API_KEY,
  config: { model: 'anthropic/claude-opus-4.6' },
  options: { debug: false }
})

// Judge uses a strong model
const judgeAI = new AxAI({
  name: 'openrouter',
  apiKey: API_KEY,
  config: { model: 'anthropic/claude-sonnet-4.6' },
  options: { debug: false }
})

// ── Training Examples ──
// Each example has: screenContext, userMessage, and an ideal response description

const trainingExamples = [
  {
    screenContext: `<active_context>
App: Ghostty
Window: npm run build
Visible content:
src/components/UserCard.tsx:28:5
error TS2322: Type 'string' is not assignable to type 'number'.
  28 |   age: user.age.toString(),
Found 1 error in src/components/UserCard.tsx:28
</active_context>`,
    userMessage: 'fix this',
    idealResponse: 'Remove the .toString() call on line 28 of UserCard.tsx — the age property expects a number but you\'re converting it to a string. Change `age: user.age.toString()` to `age: user.age`.'
  },
  {
    screenContext: `<active_context>
App: Google Chrome
Window: Add rate limiting by sarah · PR #187
URL: https://github.com/acme/api/pull/187
Visible content:
Files changed: 4
+ const limiter = rateLimit({ windowMs: 15*60*1000, max: 100 })
+ app.use("/api/", limiter)
Review: Changes requested by @mike - "Different limits per endpoint?"
</active_context>`,
    userMessage: 'summarize this PR',
    idealResponse: 'PR #187 by Sarah adds global rate limiting to all API endpoints — 100 requests per 15-minute window using express-rate-limit. Mike requested changes, suggesting different rate limits per endpoint rather than a blanket limit. 4 files changed.'
  },
  {
    screenContext: `<active_context>
App: Slack
Window: Slack | #engineering
Visible content:
@alice: Deploy to staging failed. Getting a 502 on the health check.
@bob: Looks like the new auth middleware is crashing on startup.
@alice: Can someone look at it? I need staging for the demo tomorrow.
@charlie: I can take a look. Is it the PR from yesterday?
@alice: Yes, PR #42 merged last night.
</active_context>`,
    userMessage: "help me reply that I'll investigate",
    idealResponse: "I'll dig into the staging 502 — likely the auth middleware from PR #42. Will check the startup logs and report back before EOD."
  },
  {
    screenContext: `<active_context>
App: Ghostty
Window: docker logs api
Visible content:
api  | Error: connect ECONNREFUSED 127.0.0.1:5432
api  | Error: PostgreSQL connection refused
api  | Retrying in 5s... (attempt 3/5)
api  | Process exited with code 1
</active_context>`,
    userMessage: 'why is this failing',
    idealResponse: 'Your API container can\'t connect to PostgreSQL on port 5432 — the database isn\'t running or isn\'t reachable from the container. Run `docker compose up -d postgres` to start it, or check if it\'s using the right hostname (use the service name like `db` instead of `127.0.0.1` in Docker networking).'
  },
  {
    screenContext: `<active_context>
App: Code
Window: api.ts - backend
Visible content:
async function getUser(req: Request, res: Response) {
  const userId = req.params.id
  const user = await db.query("SELECT * FROM users WHERE id = " + userId)
  return res.json(user)
}
</active_context>`,
    userMessage: 'anything wrong with this?',
    idealResponse: 'SQL injection vulnerability — you\'re concatenating user input directly into the query string. Use parameterized queries: `db.query("SELECT * FROM users WHERE id = $1", [userId])`'
  },
  {
    screenContext: `<active_context>
App: Google Chrome
Window: useEffect – React
URL: https://react.dev/reference/react/useEffect
Visible content:
useEffect(setup, dependencies?)
setup: The function with your Effect logic.
dependencies: The list of all reactive values referenced inside the setup code.
</active_context>`,
    userMessage: 'when should I use this vs useMemo?',
    idealResponse: 'useEffect is for side effects (fetching data, subscriptions, DOM mutations) that run after render. useMemo is for expensive computations you want to cache between renders. If you\'re deriving a value from props/state, use useMemo. If you\'re doing something that doesn\'t directly produce a render value (API calls, event listeners), use useEffect.'
  },
]

// ── LLM-as-Judge Metric ──

async function llmJudgeMetric({ prediction, example }) {
  const judgePrompt = `You are evaluating an AI assistant's response quality. Score each dimension from 0.0 to 1.0.

The user had this screen context:
${example.screenContext}

The user asked: "${example.userMessage}"

The ideal response would be something like:
"${example.idealResponse}"

The AI assistant responded:
"${prediction.response}"

Score these dimensions:
1. context_usage (0-1): Does the response reference specific details from the screen context (file names, error codes, URLs, names)? 1.0 = references multiple specific details. 0.0 = ignores context entirely or asks user to paste.
2. actionability (0-1): Does the response give a concrete fix, command, or next step? 1.0 = immediately actionable. 0.0 = vague or just explains.
3. conciseness (0-1): Is the response appropriately brief? 1.0 = one focused paragraph. 0.5 = 2-3 paragraphs. 0.0 = wall of text or too terse to be useful.
4. no_paste (0-1): Does it avoid asking the user to paste/share/describe what's on screen? 1.0 = never asks. 0.0 = asks user to paste.

Respond with ONLY a JSON object, no other text:
{"context_usage": 0.0, "actionability": 0.0, "conciseness": 0.0, "no_paste": 0.0}`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://kestrel.app',
        'X-Title': 'Kestrel Eval Judge'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        messages: [{ role: 'user', content: judgePrompt }],
        max_tokens: 200,
        temperature: 0
      })
    })

    if (!response.ok) return 0

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return 0

    const scores = JSON.parse(match[0])
    // Weighted composite
    const composite = (
      (scores.context_usage || 0) * 0.35 +
      (scores.actionability || 0) * 0.30 +
      (scores.conciseness || 0) * 0.20 +
      (scores.no_paste || 0) * 0.15
    )

    return composite
  } catch {
    return 0
  }
}

// ── Direct Eval (without Ax optimizer) ──
// Since Ax's signature system doesn't map cleanly to our system-prompt-injection
// pattern, we'll use Ax's concepts but run the optimization loop ourselves.

const SYSTEM_PROMPT_CANDIDATES = [
  // V1: Current prompt
  {
    name: 'v1-current',
    prompt: `You are Kestrel, a context-aware AI assistant running as a macOS desktop app. You can see the user's active application, window title, browser URL, and visible screen content.

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

Never say "I can see you're using X" as your entire response. Always add value beyond just identifying the app.`
  },
  // V2: More aggressive about using context
  {
    name: 'v2-context-first',
    prompt: `You are Kestrel. You have full visibility into the user's screen — app, window title, URL, and visible text content. This is not hypothetical; you are literally reading their screen right now.

Rules:
1. You ALREADY HAVE the screen content. Never say "paste", "share", "show me", or "describe what you see". You can see it.
2. Start every response by referencing something specific from the screen: a filename, error code, URL, person's name, or code snippet. This proves you're context-aware.
3. Give the fix, not the explanation. If you see an error, provide the corrected code or command. Explanations only if asked.
4. One paragraph max unless the user asks for detail.
5. Match the app's energy: terse for terminals, casual for Slack, thorough for code review.

Your screen context is injected below. Use it.`
  },
  // V3: Minimal, let the model figure it out
  {
    name: 'v3-minimal',
    prompt: `You are Kestrel, an AI assistant that can see the user's screen. The active app, window, URL, and visible text are provided below as context. Reference this context directly in your answers. Be concise. Never ask the user to paste or describe what's on screen — you already have it. Lead with the fix or answer, not the explanation.`
  },
  // V4: Structured with explicit anti-patterns
  {
    name: 'v4-anti-patterns',
    prompt: `You are Kestrel, a screen-aware AI assistant for macOS.

WHAT YOU CAN SEE: The user's active app, window title, URL, and visible screen text. This data is real-time and accurate.

ALWAYS DO:
- Reference specific details from the screen (filenames, line numbers, error codes, URLs, names)
- Provide actionable fixes: corrected code, terminal commands, draft messages
- Keep responses to 1-2 short paragraphs
- Match the context: technical for code/terminal, casual for chat apps

NEVER DO:
- Ask the user to paste, copy, share, or describe their screen content
- Say "I can see you're using [app]" without adding value
- Explain what an error means before offering the fix
- Write more than 3 paragraphs unless explicitly asked

The user's screen context follows.`
  },
]

async function evalPrompt(systemPrompt, examples) {
  const scores = []

  for (const ex of examples) {
    const fullPrompt = systemPrompt + '\n\n' + ex.screenContext

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://kestrel.app',
        'X-Title': 'Kestrel Prompt Optimization'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        messages: [
          { role: 'system', content: fullPrompt },
          { role: 'user', content: ex.userMessage }
        ],
        max_tokens: 400,
        temperature: 0
      })
    })

    if (!response.ok) { scores.push(0); continue }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // Judge this response
    const judgeScore = await llmJudgeMetric({
      prediction: { response: content },
      example: ex
    })

    scores.push(judgeScore)
    process.stdout.write('.')
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return { avg, scores }
}

async function main() {
  console.log('\n🦅 Kestrel System Prompt Optimizer\n')
  console.log(`Testing ${SYSTEM_PROMPT_CANDIDATES.length} prompt variants`)
  console.log(`Against ${trainingExamples.length} training examples`)
  console.log(`Using LLM-as-judge (Claude Sonnet 4.6)\n`)
  console.log('═'.repeat(60))

  const results = []

  for (const candidate of SYSTEM_PROMPT_CANDIDATES) {
    process.stdout.write(`\n${candidate.name.padEnd(25)}`)
    const { avg, scores } = await evalPrompt(candidate.prompt, trainingExamples)
    const pct = (avg * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(avg * 10)) + '░'.repeat(10 - Math.round(avg * 10))
    console.log(` ${bar} ${pct}%`)
    results.push({ name: candidate.name, avg, scores, prompt: candidate.prompt })
  }

  // Sort by score
  results.sort((a, b) => b.avg - a.avg)

  console.log('\n' + '═'.repeat(60))
  console.log('\n📊 RESULTS (ranked by LLM-as-judge score)\n')

  for (const r of results) {
    const pct = (r.avg * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(r.avg * 10)) + '░'.repeat(10 - Math.round(r.avg * 10))
    console.log(`  ${r.name.padEnd(25)} ${bar} ${pct}%`)
  }

  const winner = results[0]
  console.log(`\n🏆 Winner: ${winner.name} (${(winner.avg * 100).toFixed(1)}%)`)
  console.log(`\n--- Winning Prompt ---\n${winner.prompt}\n`)

  // Save the winner
  const fs = await import('fs')
  fs.writeFileSync('evals/optimized-prompt.json', JSON.stringify({
    winner: winner.name,
    score: winner.avg,
    prompt: winner.prompt,
    allResults: results.map(r => ({ name: r.name, score: r.avg })),
    evaluatedAt: new Date().toISOString()
  }, null, 2))
  console.log('Saved to evals/optimized-prompt.json')
  console.log('═'.repeat(60) + '\n')
}

main().catch(console.error)
